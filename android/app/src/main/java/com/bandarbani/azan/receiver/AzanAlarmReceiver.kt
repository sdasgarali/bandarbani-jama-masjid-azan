package com.bandarbani.azan.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.di.ReceiverEntryPoint
import com.bandarbani.azan.playback.AzanPlaybackService
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File

/**
 * Fires at each prayer instant AND at each scheduled announcement instant (armed by AlarmScheduler).
 * The intent's [Constants.EXTRA_TYPE] discriminates the two.
 *
 * PRAYER fire:
 *  1. Validate the prayer is still enabled AND matches the current schedule version (stale guard).
 *  2. If audioEnabled (+ device master switch) → resolve audio (prayer→default) and play.
 *  3. If notificationEnabled → post a notification.
 *  4. Re-arm the next window (self-healing chain).
 *
 * ANNOUNCEMENT fire:
 *  - Play the announcement's cached audio once (if validated & present) and post a notification with
 *    its label. No re-arm.
 *
 * We use goAsync() with a bounded coroutine so the Room reads + reschedule complete reliably.
 */
class AzanAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val entry = EntryPointAccessors.fromApplication(
            context.applicationContext, ReceiverEntryPoint::class.java,
        )
        // Default to PRAYER for backward compatibility with any alarm armed before this change.
        val type = intent.getStringExtra(Constants.EXTRA_TYPE) ?: Constants.TYPE_PRAYER

        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                withTimeoutOrNull(20_000) {
                    when (type) {
                        Constants.TYPE_ANNOUNCEMENT -> handleAnnouncement(context, entry, intent)
                        else -> handlePrayer(context, entry, intent)
                    }
                }
            } catch (t: Throwable) {
                Log.e(TAG, "onReceive failed", t)
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun handlePrayer(
        context: Context,
        entry: ReceiverEntryPoint,
        intent: Intent,
    ) {
        val prayerName = intent.getStringExtra(Constants.EXTRA_PRAYER)
        val prayer = prayerName?.let { Prayer.fromApi(it) }
        val firedVersion = intent.getIntExtra(Constants.EXTRA_SCHEDULE_VERSION, -1)
        val firedAudioVersion = intent.getIntExtra(Constants.EXTRA_AUDIO_VERSION, -1)

        val repo = entry.repository()
        val schedule = repo.getSchedule()
        val prayerTimes = repo.getPrayerTimes()
        val setting = prayer?.let { p -> prayerTimes.firstOrNull { it.prayer == p } }

        if (prayer == null || schedule == null || setting == null) {
            Log.w(TAG, "Prayer fire but no schedule/prayer; re-arming and skipping.")
        } else if (firedVersion != -1 && firedVersion != schedule.version) {
            Log.i(TAG, "Stale alarm (fired v$firedVersion, current v${schedule.version}); skip play, re-arm.")
        } else if (!setting.enabled) {
            Log.i(TAG, "$prayer disabled; skip play, re-arm.")
        } else {
            val label = prayer.name.lowercase().replaceFirstChar { it.uppercase() }

            val masterAzanOn = entry.settingsStore().masterAzanEnabled.first()
            val notificationsOn = entry.settingsStore().notificationsEnabled.first()

            // (2) Audio — resolve prayer→default. Prefer the version the scheduler pre-resolved, but
            // re-resolve defensively in case the library changed since arming.
            if (setting.audioEnabled && masterAzanOn) {
                val audio = repo.getAudioByVersion(firedAudioVersion)
                    ?.takeIf { it.validated && it.localPath != null }
                    ?: repo.resolvePrayerAudio(setting.audioId, schedule.defaultAudioId)
                        ?.takeIf { it.validated && it.localPath != null }
                val path = audio?.localPath?.takeIf { File(it).exists() }
                if (path != null) {
                    startPlayback(context, path, label)
                } else {
                    Log.w(TAG, "audioEnabled but no validated audio; posting notification only.")
                    entry.notificationHelper().postPrayerNotification(prayer)
                }
            }

            // (3) Notification
            if (setting.notificationEnabled && notificationsOn) {
                entry.notificationHelper().postPrayerNotification(prayer)
            }
        }

        // (4) Self-healing: always re-arm the next window (also re-arms announcements).
        runCatching { entry.alarmScheduler().rescheduleAll() }
            .onFailure { Log.e(TAG, "reschedule after fire failed", it) }
    }

    private suspend fun handleAnnouncement(
        context: Context,
        entry: ReceiverEntryPoint,
        intent: Intent,
    ) {
        val id = intent.getStringExtra(Constants.EXTRA_ANNOUNCEMENT_ID)
        val label = intent.getStringExtra(Constants.EXTRA_ANNOUNCEMENT_LABEL)
        var audioVersion = intent.getIntExtra(Constants.EXTRA_AUDIO_VERSION, -1)

        val repo = entry.repository()

        // Re-check the stored announcement so a disabled/deleted one never plays after arming.
        val stored = id?.let { repo.getAnnouncementById(it) }
        if (id != null && stored == null) {
            Log.i(TAG, "Announcement $id no longer stored; skipping.")
            return
        }
        if (stored != null && !stored.enabled) {
            Log.i(TAG, "Announcement $id disabled; skipping.")
            return
        }
        if (stored != null) audioVersion = stored.audioVersion

        val title = (stored?.label ?: label)?.takeIf { it.isNotBlank() } ?: "Announcement"

        // Device master switch silences announcement AUDIO too (consistent with prayer azan), but we
        // still post the notification so the user isn't left unaware.
        val masterAzanOn = entry.settingsStore().masterAzanEnabled.first()

        val audio = repo.getAudioByVersion(audioVersion)
            ?.takeIf { it.validated && it.localPath != null }
        val path = audio?.localPath?.takeIf { File(it).exists() }

        if (path != null && masterAzanOn) {
            startPlayback(context, path, title)
        } else if (path == null) {
            Log.w(TAG, "Announcement ${id ?: ""} audio v$audioVersion not validated/missing; notification only.")
        }

        entry.notificationHelper().postAnnouncementNotification(id ?: title, title)
        // No re-arm: announcements are one-off. Prayer alarms self-heal on their own fires.
    }

    private fun startPlayback(context: Context, path: String, label: String) {
        val startIntent = AzanPlaybackService.startIntent(context, path, label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, startIntent)
        } else {
            context.startService(startIntent)
        }
    }

    companion object {
        private const val TAG = "AzanAlarmReceiver"
    }
}
