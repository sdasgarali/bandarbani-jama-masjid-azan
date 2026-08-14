package com.bandarbani.azan

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.bandarbani.azan.notifications.NotificationHelper
import com.bandarbani.azan.work.SyncWorker
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

/**
 * Application entry point:
 *  - @HiltAndroidApp bootstraps the DI graph.
 *  - Implements Configuration.Provider so WorkManager uses Hilt's worker factory (required for
 *    @HiltWorker injection). The default WorkManager initializer is disabled in the manifest.
 *  - Creates notification channels once.
 *  - Schedules the daily safety-net sync.
 */
@HiltAndroidApp
class AzanApplication : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var notificationHelper: NotificationHelper

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        notificationHelper.createChannels()
        // Safety-net daily re-sync (KEEP: does not disturb an existing schedule).
        SyncWorker.enqueuePeriodic(this)
    }
}
