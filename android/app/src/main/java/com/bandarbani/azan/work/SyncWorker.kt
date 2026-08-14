package com.bandarbani.azan.work

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bandarbani.azan.audio.AudioSyncWorker
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.scheduling.AlarmScheduler
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * Fetches /schedule/current with ETag. On change: Room is updated, old alarms cancelled, alarms
 * re-armed, and (if a new audio version needs downloading) AudioSyncWorker is enqueued.
 *
 * Reliability: on network failure we Result.retry() with backoff and keep the existing local
 * schedule + armed alarms untouched (app stays functional offline).
 *
 * Enqueued as:
 *  - one-shot from FCM SCHEDULE_UPDATED / CONFIG_UPDATED and from onboarding.
 *  - periodic once/day as a safety net for missed pushes.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val repository: AzanRepository,
    private val alarmScheduler: AlarmScheduler,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return when (val result = repository.syncSchedule()) {
            is AzanRepository.SyncResult.Updated -> {
                Log.i(TAG, "Schedule updated to v${result.version}; re-arming alarms.")
                // Cancel + re-arm (rescheduleAll cancels the tracked set first, so this is safe).
                alarmScheduler.rescheduleAll()
                if (result.audioNeedsDownload) {
                    AudioSyncWorker.enqueue(applicationContext)
                }
                Result.success()
            }
            AzanRepository.SyncResult.NotModified -> {
                // Still re-arm defensively (covers date rollover on the daily tick).
                alarmScheduler.rescheduleAll()
                Result.success()
            }
            AzanRepository.SyncResult.NeverPublished -> Result.success()
            is AzanRepository.SyncResult.Failed -> {
                Log.w(TAG, "Sync failed: ${result.message}; will retry.")
                Result.retry()
            }
        }
    }

    companion object {
        private const val TAG = "SyncWorker"

        private val networkConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        /** Fire-and-forget sync (from FCM / onboarding / "Sync now"). */
        fun enqueueOneShot(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(networkConstraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                Constants.WORK_SYNC_ONESHOT,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        /**
         * Safety-net sync 6 times a day (every 4 hours) in case an FCM push was missed.
         * WorkManager batches this with system maintenance windows / Doze, so exact spacing
         * varies slightly, but it targets ~6 runs/day. UPDATE policy re-applies the interval
         * to existing installs after an app update (not just fresh installs).
         */
        fun enqueuePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(4, TimeUnit.HOURS)
                .setConstraints(networkConstraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                Constants.WORK_SYNC_PERIODIC,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }
    }
}
