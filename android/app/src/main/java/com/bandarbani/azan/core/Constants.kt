package com.bandarbani.azan.core

/** App-wide constant identifiers. Kept in one place to avoid magic strings. */
object Constants {
    // Notification channels
    const val CHANNEL_AZAN_ID = "azan_playback"
    const val CHANNEL_GENERAL_ID = "general"

    // Notification ids
    const val NOTIF_PLAYBACK_ID = 1001
    const val NOTIF_PRAYER_BASE_ID = 2000 // + prayer.ordinal
    const val NOTIF_TEST_ID = 3001

    // Alarm request-code namespace. requestCode = BASE + prayer.ordinal (see AlarmScheduler).
    const val ALARM_REQUEST_BASE = 10_000

    // Intent extras passed from AlarmScheduler -> AzanAlarmReceiver.
    const val EXTRA_PRAYER = "extra_prayer"
    const val EXTRA_SCHEDULE_VERSION = "extra_schedule_version"
    const val EXTRA_EPOCH_DAY = "extra_epoch_day"

    // Playback service extras
    const val EXTRA_AUDIO_PATH = "extra_audio_path"
    const val EXTRA_PRAYER_LABEL = "extra_prayer_label"

    // Audio storage
    const val AUDIO_DIR = "azan"
    fun audioFileName(version: Int) = "azan_v$version.mp3"
    fun audioTmpName(version: Int) = "azan_v$version.mp3.tmp"

    // WorkManager unique names / tags
    const val WORK_SYNC_ONESHOT = "sync_oneshot"
    const val WORK_SYNC_PERIODIC = "sync_periodic"
    const val WORK_AUDIO_DOWNLOAD = "audio_download"
    const val WORK_RESCHEDULE = "reschedule_oneshot"
}
