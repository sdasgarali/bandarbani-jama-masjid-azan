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

/**
 * Fires at each prayer instant (armed by AlarmScheduler). On fire:
 *  1. Validate the prayer is still enabled AND matches the current schedule version (guards stale
 *     alarms left over after an update).
 *  2. If audioEnabled → start the short-lived playback foreground service.
 *  3. If notificationEnabled → post a notification.
 *  4. Re-arm the next prayer (self-healing chain).
 *
 * We use goAsync() with a bounded coroutine so the Room reads + reschedule complete reliably.
 */
class AzanAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val prayerName = intent.getStringExtra(Constants.EXTRA_PRAYER) ?: return
        val firedVersion = intent.getIntExtra(Constants.EXTRA_SCHEDULE_VERSION, -1)
        val prayer = Prayer.fromApi(prayerName) ?: return

        val entry = EntryPointAccessors.fromApplication(
            context.applicationContext, ReceiverEntryPoint::class.java,
        )

        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                withTimeoutOrNull(20_000) {
                    handleFire(context, entry, prayer, firedVersion)
                }
            } catch (t: Throwable) {
                Log.e(TAG, "onReceive failed", t)
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun handleFire(
        context: Context,
        entry: ReceiverEntryPoint,
        prayer: Prayer,
        firedVersion: Int,
    ) {
        val repo = entry.repository()
        val schedule = repo.getSchedule()
        val prayerTimes = repo.getPrayerTimes()
        val setting = prayerTimes.firstOrNull { it.prayer == prayer }

        // (1) Validate: schedule exists, version matches (stale-alarm guard), prayer still enabled.
        if (schedule == null || setting == null) {
            Log.w(TAG, "Fire for $prayer but no schedule/prayer; re-arming and skipping.")
        } else if (firedVersion != -1 && firedVersion != schedule.version) {
            Log.i(
                TAG,
                "Stale alarm (fired v$firedVersion, current v${schedule.version}); skip play, re-arm.",
            )
        } else if (!setting.enabled) {
            Log.i(TAG, "$prayer disabled; skip play, re-arm.")
        } else {
            val label = prayer.name.lowercase().replaceFirstChar { it.uppercase() }

            // Device-local master switch: user can silence Azan on THIS device without touching
            // the admin schedule. Notifications are still governed by their own toggles.
            val masterAzanOn = entry.settingsStore().masterAzanEnabled.first()
            val notificationsOn = entry.settingsStore().notificationsEnabled.first()

            // (2) Audio
            if (setting.audioEnabled && masterAzanOn) {
                val audio = repo.getActiveAudio()
                val path = audio?.localPath
                if (path != null) {
                    val startIntent = AzanPlaybackService.startIntent(context, path, label)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        ContextCompat.startForegroundService(context, startIntent)
                    } else {
                        context.startService(startIntent)
                    }
                } else {
                    Log.w(TAG, "audioEnabled but no local audio; posting notification only.")
                    entry.notificationHelper().postPrayerNotification(prayer)
                }
            }

            // (3) Notification
            if (setting.notificationEnabled && notificationsOn) {
                entry.notificationHelper().postPrayerNotification(prayer)
            }
        }

        // (4) Self-healing: always re-arm the next window.
        runCatching { entry.alarmScheduler().rescheduleAll() }
            .onFailure { Log.e(TAG, "reschedule after fire failed", it) }
    }

    companion object {
        private const val TAG = "AzanAlarmReceiver"
    }
}
