package com.bandarbani.azan.domain

import android.content.Context
import android.os.Build
import android.util.Log
import com.bandarbani.azan.BuildConfig
import com.bandarbani.azan.audio.AudioSyncWorker
import com.bandarbani.azan.data.prefs.DeviceCredentialStore
import com.bandarbani.azan.data.remote.dto.RegisterDeviceRequest
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.scheduling.AlarmScheduler
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import java.time.ZoneId
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Orchestrates the onboarding backend flow (ARCHITECTURE §"first-run onboarding" order):
 * register device → get FCM token → sync schedule → (enqueue) download audio → schedule alarms.
 * Idempotent: safe to re-run; skips registration if a secret already exists.
 */
@Singleton
class DeviceRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val credentials: DeviceCredentialStore,
    private val repository: AzanRepository,
    private val alarmScheduler: AlarmScheduler,
) {
    sealed interface Step {
        data object Registering : Step
        data object FetchingToken : Step
        data object Syncing : Step
        data object Scheduling : Step
        data object Done : Step
        data class Failed(val message: String) : Step
    }

    /**
     * Runs the full flow, invoking [onStep] as it progresses. Returns true on success.
     * Network failures during sync are tolerated if a prior local schedule exists.
     */
    suspend fun runOnboardingFlow(onStep: (Step) -> Unit): Boolean {
        val timezone = ZoneId.systemDefault().id

        // 1) FCM token first so we can include it at registration.
        onStep(Step.FetchingToken)
        val token = runCatching { fetchFcmToken() }.getOrNull()
        token?.let { credentials.fcmToken = it }

        // 2) Register (skip if already registered).
        if (!credentials.isRegistered) {
            onStep(Step.Registering)
            val body = RegisterDeviceRequest(
                deviceId = credentials.getOrCreateDeviceId(),
                appVersion = BuildConfig.VERSION_NAME,
                androidVersion = Build.VERSION.SDK_INT,
                model = "${Build.MANUFACTURER} ${Build.MODEL}",
                timezone = timezone,
                fcmToken = token,
            )
            val result = repository.registerDevice(body)
            result.onSuccess { secret -> credentials.deviceSecret = secret }
                .onFailure {
                    Log.e(TAG, "register failed", it)
                    onStep(Step.Failed("Registration failed: ${it.message}"))
                    return false
                }
        } else {
            // Already registered — push latest token if we have one.
            token?.let { repository.updateFcmToken(it) }
        }

        // 3) Sync schedule.
        onStep(Step.Syncing)
        val sync = repository.syncSchedule()
        when (sync) {
            is AzanRepository.SyncResult.Updated -> {
                if (sync.audioNeedsDownload) AudioSyncWorker.enqueue(context)
            }
            AzanRepository.SyncResult.NotModified,
            AzanRepository.SyncResult.NeverPublished -> Unit
            is AzanRepository.SyncResult.Failed -> {
                // Tolerate if we already have a local schedule (offline-first).
                if (repository.getSchedule() == null) {
                    onStep(Step.Failed("Could not fetch schedule: ${sync.message}"))
                    return false
                }
            }
        }

        // 4) Ensure audio download is enqueued if the active audio is missing a local file.
        val activeAudio = repository.getActiveAudio()
        if (activeAudio == null || activeAudio.localPath == null) {
            AudioSyncWorker.enqueue(context)
        }

        // 5) Schedule alarms.
        onStep(Step.Scheduling)
        alarmScheduler.rescheduleAll()

        credentials.onboardingComplete = true
        onStep(Step.Done)
        return true
    }

    private suspend fun fetchFcmToken(): String =
        suspendCancellableCoroutine { cont ->
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> if (cont.isActive) cont.resume(token) }
                .addOnFailureListener { e -> if (cont.isActive) cont.cancel(e) }
        }

    companion object {
        private const val TAG = "DeviceRegistrar"
    }
}
