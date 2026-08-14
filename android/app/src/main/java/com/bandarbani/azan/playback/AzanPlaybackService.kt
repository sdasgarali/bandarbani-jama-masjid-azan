package com.bandarbani.azan.playback

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.notifications.NotificationHelper
import dagger.hilt.android.AndroidEntryPoint
import java.io.File
import javax.inject.Inject

/**
 * SHORT-LIVED foreground service that plays the local Azan once, then stops itself.
 *
 * Reliability details (ANDROID_SCHEDULING.md §2):
 *  - USAGE_ALARM audio attributes → sounds while locked and respects DND alarm exceptions.
 *  - Requests audio focus; abandons it on stop.
 *  - Started as a mediaPlayback foreground service (required by API 34 for background start).
 *  - Holds a short WAKE_LOCK so the CPU stays awake for the duration of playback.
 *  - This is NOT a permanent service: it self-stops when playback ends, errors, or focus is lost.
 */
@AndroidEntryPoint
class AzanPlaybackService : Service() {

    @Inject lateinit var notificationHelper: NotificationHelper

    private var player: ExoPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioManager: AudioManager? = null
    private var focusRequest: android.media.AudioFocusRequest? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val path = intent?.getStringExtra(Constants.EXTRA_AUDIO_PATH)
        val label = intent?.getStringExtra(Constants.EXTRA_PRAYER_LABEL) ?: "Azan"

        // Enter foreground immediately (must happen within a few seconds of start).
        startAsForeground(label)

        if (path.isNullOrBlank() || !File(path).exists()) {
            Log.w(TAG, "No valid audio file at '$path'; stopping.")
            stopEverything()
            return START_NOT_STICKY
        }

        acquireWakeLock()
        if (!requestAudioFocus()) {
            Log.w(TAG, "Audio focus denied; playing on alarm stream anyway.")
        }
        startPlayback(path)
        return START_NOT_STICKY
    }

    private fun startAsForeground(label: String) {
        val notification = notificationHelper.buildPlaybackNotification(label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                Constants.NOTIF_PLAYBACK_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(Constants.NOTIF_PLAYBACK_ID, notification)
        }
    }

    private fun startPlayback(path: String) {
        val attrs = AudioAttributes.Builder()
            .setUsage(C.USAGE_ALARM)
            .setContentType(C.AUDIO_CONTENT_TYPE_SONIFICATION)
            .build()

        val exo = ExoPlayer.Builder(this)
            // handleAudioFocus=false: we manage focus manually so we can play on the alarm stream.
            .setAudioAttributes(attrs, /* handleAudioFocus = */ false)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
            .also { player = it }

        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    Log.i(TAG, "Playback ended.")
                    stopEverything()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "Playback error", error)
                stopEverything()
            }
        })

        exo.setMediaItem(MediaItem.fromUri(File(path).toURI().toString()))
        exo.repeatMode = Player.REPEAT_MODE_OFF
        exo.playWhenReady = true
        exo.prepare()
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$TAG::playback").apply {
            setReferenceCounted(false)
            // Safety timeout so a stuck player never drains the battery.
            acquire(5 * 60 * 1000L)
        }
    }

    @Suppress("DEPRECATION")
    private fun requestAudioFocus(): Boolean {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager = am
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val req = android.media.AudioFocusRequest.Builder(
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
            ).setAudioAttributes(attrs).build()
            focusRequest = req
            am.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            am.requestAudioFocus(
                null,
                AudioManager.STREAM_ALARM,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    }

    @Suppress("DEPRECATION")
    private fun abandonAudioFocus() {
        val am = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { am.abandonAudioFocusRequest(it) }
        } else {
            am.abandonAudioFocus(null)
        }
    }

    private fun stopEverything() {
        player?.run {
            stop()
            release()
        }
        player = null
        abandonAudioFocus()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopEverything()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "AzanPlaybackService"

        /** Build a start intent for a given local audio file + prayer label. */
        fun startIntent(context: Context, audioPath: String, prayerLabel: String): Intent =
            Intent(context, AzanPlaybackService::class.java).apply {
                putExtra(Constants.EXTRA_AUDIO_PATH, audioPath)
                putExtra(Constants.EXTRA_PRAYER_LABEL, prayerLabel)
            }
    }
}
