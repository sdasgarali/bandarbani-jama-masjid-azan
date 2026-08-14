package com.bandarbani.azan.work

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bandarbani.azan.core.Constants
import com.bandarbani.azan.scheduling.AlarmScheduler
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Re-arms alarms. Enqueued by BootReceiver (reboot / update / time / tz change). Idempotent because
 * AlarmScheduler.rescheduleAll uses deterministic request codes.
 */
@HiltWorker
class RescheduleWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val alarmScheduler: AlarmScheduler,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = try {
        alarmScheduler.rescheduleAll()
        Result.success()
    } catch (t: Throwable) {
        Result.retry()
    }

    companion object {
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<RescheduleWorker>().build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                Constants.WORK_RESCHEDULE,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
