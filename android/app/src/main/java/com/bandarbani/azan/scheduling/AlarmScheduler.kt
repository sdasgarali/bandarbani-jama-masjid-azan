package com.bandarbani.azan.scheduling

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.data.local.dao.ScheduleDao
import com.bandarbani.azan.data.local.dao.SyncStateDao
import com.bandarbani.azan.data.local.entity.SyncStateEntity
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.receiver.AzanAlarmReceiver
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Arms exact alarms for upcoming prayers AND future announcements. IDEMPOTENT: because request codes
 * are deterministic, calling [rescheduleAll] repeatedly replaces existing PendingIntents rather than
 * duplicating them.
 *
 * Strategy (see ANDROID_SCHEDULING.md §3, §6b):
 *  1. Read schedule + timezone from Room.
 *  2. Cancel every previously-armed request code (tracked in SyncState) — prayers AND announcements.
 *  3. Compute next fire per enabled prayer; arm a rolling window of the soonest N, resolving each
 *     prayer's audio (prayer.audioId → defaultAudioId) to a cached version so the receiver knows what
 *     to play without a DB lookup at fire time.
 *  4. For every ENABLED announcement whose instant is in the FUTURE, arm an exact alarm with a
 *     deterministic, distinct request code (separate numeric range → never collides with prayers).
 *  5. Persist the newly-armed request-code set (prayers + announcements) for clean cancellation.
 */
@Singleton
class AlarmScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val scheduleDao: ScheduleDao,
    private val syncStateDao: SyncStateDao,
    private val repository: AzanRepository,
) {
    private val alarmManager: AlarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    /** How many of the soonest upcoming prayers to pre-arm. Self-healing chain re-arms after each. */
    private val rollingWindow = 2

    suspend fun rescheduleAll() {
        val schedule = scheduleDao.getSchedule()
        if (schedule == null) {
            Log.i(TAG, "rescheduleAll: no schedule stored yet; nothing to arm.")
            return
        }
        val prayerTimes = scheduleDao.getPrayerTimes()
        val zone = runCatching { ZoneId.of(schedule.timezone) }.getOrElse {
            Log.w(TAG, "Invalid timezone '${schedule.timezone}', falling back to system default.")
            ZoneId.systemDefault()
        }

        // 1) Cancel all previously-armed alarms (idempotent regardless of current schedule).
        cancelAll()

        val armed = mutableSetOf<Int>()
        val now = Instant.now()

        // 2) Prayers — arm the soonest N.
        val enabled = prayerTimes.filter { it.enabled }.map { it.prayer to it.time }
        val fires = AlarmTimeCalculator.nextFires(enabled, zone, now)
        for (fire in fires.take(rollingWindow)) {
            val setting = prayerTimes.firstOrNull { it.prayer == fire.prayer }
            // Resolve this prayer's audio (prayer.audioId → defaultAudioId) to a cached version so the
            // receiver plays the right clip with no DB race at fire time. -1 ⇒ notification only.
            val audioVersion = repository
                .resolvePrayerAudio(setting?.audioId, schedule.defaultAudioId)
                ?.takeIf { it.validated && it.localPath != null }
                ?.version ?: -1
            val requestCode = RequestCodes.forPrayerOnDate(
                fire.prayer, fire.localDate, Constants.ALARM_REQUEST_BASE,
            )
            val pi = buildPrayerPendingIntent(
                requestCode = requestCode,
                prayer = fire.prayer,
                scheduleVersion = schedule.version,
                epochDay = fire.localDate.toEpochDay(),
                audioVersion = audioVersion,
            )
            armExact(fire.instant.toEpochMilli(), pi)
            armed += requestCode
            Log.i(
                TAG,
                "Armed prayer ${fire.prayer} at ${fire.instant} (code=$requestCode, v=${schedule.version}, audioV=$audioVersion)",
            )
        }

        // 3) Announcements — arm every enabled future one.
        val announcements = repository.getEnabledFutureAnnouncements(now.toEpochMilli())
        for (ann in announcements) {
            val requestCode = RequestCodes.announcement(
                ann.id, ann.audioVersion, ann.scheduledAtEpochMillis, Constants.ANNOUNCEMENT_REQUEST_BASE,
            )
            val pi = buildAnnouncementPendingIntent(
                requestCode = requestCode,
                announcementId = ann.id,
                label = ann.label,
                audioVersion = ann.audioVersion,
            )
            armExact(ann.scheduledAtEpochMillis, pi)
            armed += requestCode
            Log.i(
                TAG,
                "Armed announcement ${ann.id} at ${ann.scheduledAtEpochMillis} (code=$requestCode, audioV=${ann.audioVersion})",
            )
        }

        // 4) Persist the armed set for later idempotent cancellation.
        persistArmed(armed)
    }

    /** Cancel every request code we previously armed (read from SyncState CSV) + defensive sweep. */
    suspend fun cancelAll() {
        val state = syncStateDao.get()
        val codes = state?.armedRequestCodes
            ?.split(',')
            ?.mapNotNull { it.trim().toIntOrNull() }
            ?: emptyList()
        codes.forEach { code ->
            existingPendingIntent(code)?.let {
                alarmManager.cancel(it)
                it.cancel()
            }
        }
        // Defensively cancel the full deterministic PRAYER key-space for both day buckets, in case a
        // prior state record was lost (e.g. cleared data) but an OS alarm survived. Announcement codes
        // are content-derived (not enumerable), so they rely on the tracked CSV above.
        for (bucket in 0 until 2) {
            for (ordinal in Prayer.entries.indices) {
                val code = Constants.ALARM_REQUEST_BASE + bucket * 5 + ordinal
                existingPendingIntent(code)?.let {
                    alarmManager.cancel(it)
                    it.cancel()
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun armExact(triggerAtMillis: Long, pi: PendingIntent) {
        val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
        if (canExact) {
            val showIntent = PendingIntent.getActivity(
                context,
                0,
                Intent(context, com.bandarbani.azan.ui.MainActivity::class.java),
                pendingIntentFlags(),
            )
            val info = AlarmManager.AlarmClockInfo(triggerAtMillis, showIntent)
            alarmManager.setAlarmClock(info, pi)
        } else {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, triggerAtMillis, pi,
            )
        }
    }

    private fun buildPrayerPendingIntent(
        requestCode: Int,
        prayer: Prayer,
        scheduleVersion: Int,
        epochDay: Long,
        audioVersion: Int,
    ): PendingIntent {
        val intent = Intent(context, AzanAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(Constants.EXTRA_TYPE, Constants.TYPE_PRAYER)
            putExtra(Constants.EXTRA_PRAYER, prayer.name)
            putExtra(Constants.EXTRA_SCHEDULE_VERSION, scheduleVersion)
            putExtra(Constants.EXTRA_EPOCH_DAY, epochDay)
            putExtra(Constants.EXTRA_AUDIO_VERSION, audioVersion)
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags())
    }

    private fun buildAnnouncementPendingIntent(
        requestCode: Int,
        announcementId: String,
        label: String?,
        audioVersion: Int,
    ): PendingIntent {
        val intent = Intent(context, AzanAlarmReceiver::class.java).apply {
            action = ACTION_FIRE
            putExtra(Constants.EXTRA_TYPE, Constants.TYPE_ANNOUNCEMENT)
            putExtra(Constants.EXTRA_ANNOUNCEMENT_ID, announcementId)
            putExtra(Constants.EXTRA_ANNOUNCEMENT_LABEL, label)
            putExtra(Constants.EXTRA_AUDIO_VERSION, audioVersion)
        }
        return PendingIntent.getBroadcast(context, requestCode, intent, pendingIntentFlags())
    }

    /** Retrieve an existing PendingIntent WITHOUT creating a new one (NO_CREATE). */
    private fun existingPendingIntent(requestCode: Int): PendingIntent? {
        val intent = Intent(context, AzanAlarmReceiver::class.java).apply { action = ACTION_FIRE }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun pendingIntentFlags(): Int =
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    private suspend fun persistArmed(codes: Set<Int>) {
        val prev = syncStateDao.get() ?: SyncStateEntity(
            lastEtag = null, lastSyncAt = null, lastSyncResult = null, armedRequestCodes = null,
        )
        syncStateDao.upsert(prev.copy(armedRequestCodes = codes.joinToString(",")))
    }

    companion object {
        private const val TAG = "AlarmScheduler"
        const val ACTION_FIRE = "com.bandarbani.azan.action.AZAN_FIRE"
    }
}
