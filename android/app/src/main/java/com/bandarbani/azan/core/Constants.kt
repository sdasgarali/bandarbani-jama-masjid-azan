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
    const val NOTIF_UPDATE_ID = 4001

    // Notification ids for scheduled announcements. + announcement stable index (see below).
    const val NOTIF_ANNOUNCEMENT_BASE_ID = 5000

    // Alarm request-code namespace. Prayers occupy [ALARM_REQUEST_BASE, ALARM_REQUEST_BASE+9]
    // (2 day-buckets * 5 prayers). Announcements live in a SEPARATE range that can never overlap
    // the prayer space (see RequestCodes.announcement).
    const val ALARM_REQUEST_BASE = 10_000
    const val ANNOUNCEMENT_REQUEST_BASE = 20_000

    // Intent action + type discriminator for the alarm receiver.
    const val EXTRA_TYPE = "extra_type"
    const val TYPE_PRAYER = "PRAYER"
    const val TYPE_ANNOUNCEMENT = "ANNOUNCEMENT"

    // Intent extras passed from AlarmScheduler -> AzanAlarmReceiver.
    const val EXTRA_PRAYER = "extra_prayer"
    const val EXTRA_SCHEDULE_VERSION = "extra_schedule_version"
    const val EXTRA_EPOCH_DAY = "extra_epoch_day"
    /** Resolved audio version to play for this fire (prayer or announcement); -1 = none. */
    const val EXTRA_AUDIO_VERSION = "extra_audio_version"
    // Announcement extras.
    const val EXTRA_ANNOUNCEMENT_ID = "extra_announcement_id"
    const val EXTRA_ANNOUNCEMENT_LABEL = "extra_announcement_label"

    // Playback service extras
    const val EXTRA_AUDIO_PATH = "extra_audio_path"
    const val EXTRA_PRAYER_LABEL = "extra_prayer_label"

    // Audio storage
    const val AUDIO_DIR = "azan"
    fun audioFileName(version: Int) = "azan_v$version.mp3"
    fun audioTmpName(version: Int) = "azan_v$version.mp3.tmp"

    // In-app APK update storage
    // Directory name under getExternalFilesDir()/cacheDir; MUST match res/xml/file_paths.xml.
    const val UPDATES_DIR = "updates"
    fun apkFileName(versionCode: Int) = "app-v$versionCode.apk"
    fun apkTmpName(versionCode: Int) = "app-v$versionCode.apk.tmp"
    const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    // FileProvider authority = "${applicationId}.fileprovider" (see AndroidManifest.xml).
    const val FILE_PROVIDER_AUTHORITY_SUFFIX = ".fileprovider"

    // WorkManager unique names / tags
    const val WORK_SYNC_ONESHOT = "sync_oneshot"
    const val WORK_SYNC_PERIODIC = "sync_periodic"
    const val WORK_AUDIO_DOWNLOAD = "audio_download"
    const val WORK_RESCHEDULE = "reschedule_oneshot"
}
