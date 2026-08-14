package com.bandarbani.azan.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.bandarbani.azan.R
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.ui.MainActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Owns notification channels and posting. Channels are created once (idempotent) from the
 * Application. The azan channel is high importance so it is heads-up; general is default.
 */
@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun createChannels() {
        val nm = context.getSystemService(NotificationManager::class.java)

        val azan = NotificationChannel(
            Constants.CHANNEL_AZAN_ID,
            context.getString(R.string.channel_azan_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_azan_desc)
            setShowBadge(true)
            // Playback provides the sound; suppress the channel tone to avoid double audio.
            setSound(null, null)
        }

        val general = NotificationChannel(
            Constants.CHANNEL_GENERAL_ID,
            context.getString(R.string.channel_general_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_general_desc)
        }

        nm.createNotificationChannel(azan)
        nm.createNotificationChannel(general)
    }

    /** Notification used as the foreground notification for playback. */
    fun buildPlaybackNotification(prayerLabel: String) =
        NotificationCompat.Builder(context, Constants.CHANNEL_AZAN_ID)
            .setSmallIcon(R.drawable.ic_azan_notification)
            .setContentTitle(context.getString(R.string.notif_playing_title))
            .setContentText(context.getString(R.string.notif_playing_text, prayerLabel))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(mainActivityIntent())
            .build()

    /** Per-prayer time notification (posted when notificationEnabled). */
    fun postPrayerNotification(prayer: Prayer) {
        val label = prayer.name.lowercase().replaceFirstChar { it.uppercase() }
        val notif = NotificationCompat.Builder(context, Constants.CHANNEL_AZAN_ID)
            .setSmallIcon(R.drawable.ic_azan_notification)
            .setContentTitle(context.getString(R.string.notif_prayer_title, label))
            .setContentText(context.getString(R.string.notif_prayer_text, label))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(mainActivityIntent())
            .build()
        safeNotify(Constants.NOTIF_PRAYER_BASE_ID + prayer.ordinal, notif)
    }

    /**
     * Scheduled-announcement notification. Posted on the high-importance azan channel so it's
     * heads-up like a prayer alert. [id] is the announcement id (used to derive a stable, distinct
     * notification id so multiple announcements don't overwrite each other).
     */
    fun postAnnouncementNotification(id: String, label: String) {
        val notif = NotificationCompat.Builder(context, Constants.CHANNEL_AZAN_ID)
            .setSmallIcon(R.drawable.ic_azan_notification)
            .setContentTitle(label)
            .setContentText(context.getString(R.string.notif_announcement_text))
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(context.getString(R.string.notif_announcement_text)),
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(mainActivityIntent())
            .build()
        val notifId = Constants.NOTIF_ANNOUNCEMENT_BASE_ID + (Math.floorMod(id.hashCode(), 1000))
        safeNotify(notifId, notif)
    }

    fun postSimpleNotification(title: String, body: String) {
        val notif = NotificationCompat.Builder(context, Constants.CHANNEL_GENERAL_ID)
            .setSmallIcon(R.drawable.ic_azan_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(mainActivityIntent())
            .build()
        safeNotify(Constants.NOTIF_TEST_ID, notif)
    }

    /**
     * "A new version is available — tap to update". Tapping opens MainActivity (Home), which
     * re-checks and surfaces the update dialog. Uses the general channel (created in [createChannels]).
     */
    fun postUpdateNotification(versionName: String) {
        val title = context.getString(R.string.notif_update_title)
        val body = context.getString(R.string.notif_update_text, versionName)
        val notif = NotificationCompat.Builder(context, Constants.CHANNEL_GENERAL_ID)
            .setSmallIcon(R.drawable.ic_azan_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(mainActivityIntent())
            .build()
        safeNotify(Constants.NOTIF_UPDATE_ID, notif)
    }

    private fun mainActivityIntent(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun safeNotify(id: Int, notification: android.app.Notification) {
        // POST_NOTIFICATIONS may be denied on 33+. NotificationManagerCompat swallows if disabled;
        // we guard to avoid SecurityException on some OEMs.
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            try {
                NotificationManagerCompat.from(context).notify(id, notification)
            } catch (_: SecurityException) {
                // Permission not granted at runtime; ignore — azan audio still plays.
            }
        }
    }
}
