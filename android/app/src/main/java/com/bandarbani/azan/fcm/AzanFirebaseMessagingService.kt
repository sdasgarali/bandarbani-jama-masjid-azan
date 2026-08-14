package com.bandarbani.azan.fcm

import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.bandarbani.azan.data.prefs.DeviceCredentialStore
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.notifications.NotificationHelper
import com.bandarbani.azan.playback.AzanPlaybackService
import com.bandarbani.azan.work.SyncWorker
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Handles DATA-ONLY FCM messages (API.md §"FCM data message contract"). Never plays audio from a
 * network fetch; only triggers local behavior:
 *  - SCHEDULE_UPDATED / CONFIG_UPDATED → enqueue SyncWorker.
 *  - TEST_AZAN                         → play the cached (local) azan once.
 *  - TEST_NOTIFICATION                → show a local notification.
 * On token refresh → PUT /devices/fcm-token (if already registered).
 */
@AndroidEntryPoint
class AzanFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var repository: AzanRepository
    @Inject lateinit var notificationHelper: NotificationHelper
    @Inject lateinit var credentials: DeviceCredentialStore

    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val type = data["type"] ?: return
        Log.i(TAG, "FCM data message type=$type")

        when (type) {
            TYPE_SCHEDULE_UPDATED, TYPE_CONFIG_UPDATED -> {
                SyncWorker.enqueueOneShot(applicationContext)
            }
            TYPE_TEST_AZAN -> playCachedAzan()
            TYPE_TEST_NOTIFICATION -> {
                val title = data["title"] ?: getString(com.bandarbani.azan.R.string.app_name)
                val body = data["body"] ?: "Test notification"
                notificationHelper.postSimpleNotification(title, body)
            }
            else -> Log.d(TAG, "Unknown FCM type=$type")
        }
    }

    private fun playCachedAzan() {
        scope.launch {
            val audio = repository.getActiveAudio()
            val path = audio?.localPath
            if (path == null) {
                Log.w(TAG, "TEST_AZAN but no cached audio; showing notification instead.")
                notificationHelper.postSimpleNotification(
                    getString(com.bandarbani.azan.R.string.app_name),
                    "Test Azan requested, but audio is not downloaded yet.",
                )
                return@launch
            }
            val intent = AzanPlaybackService.startIntent(applicationContext, path, "Test Azan")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(applicationContext, intent)
            } else {
                applicationContext.startService(intent)
            }
        }
    }

    override fun onNewToken(token: String) {
        Log.i(TAG, "New FCM token")
        credentials.fcmToken = token
        // Only push if we're already registered (otherwise onboarding will send it at register time).
        if (credentials.isRegistered) {
            scope.launch {
                repository.updateFcmToken(token)
                    .onFailure { Log.w(TAG, "fcm-token update failed", it) }
            }
        }
    }

    companion object {
        private const val TAG = "AzanFcm"
        private const val TYPE_SCHEDULE_UPDATED = "SCHEDULE_UPDATED"
        private const val TYPE_CONFIG_UPDATED = "CONFIG_UPDATED"
        private const val TYPE_TEST_AZAN = "TEST_AZAN"
        private const val TYPE_TEST_NOTIFICATION = "TEST_NOTIFICATION"
    }
}
