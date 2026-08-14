package com.bandarbani.azan.receiver

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import com.bandarbani.azan.core.Constants
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Robolectric test: a BOOT_COMPLETED broadcast to BootReceiver must enqueue the RescheduleWorker.
 * We initialize a test WorkManager with a synchronous executor so enqueue is observable.
 *
 * NOTE: The full end-to-end assertion (alarms actually armed in a ShadowAlarmManager) belongs in an
 * instrumented test — see androidTest/RebootReschedulingInstrumentedTest for the documented stub.
 */
@RunWith(RobolectricTestRunner::class)
// Use the stock Application (not @HiltAndroidApp AzanApplication) so no DI graph is required and
// onCreate side-effects (channels, periodic work) don't run during this unit test.
@Config(sdk = [33], application = android.app.Application::class)
class BootRescheduleTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val config = Configuration.Builder()
            .setExecutor(SynchronousExecutor())
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)
    }

    @Test
    fun `boot completed enqueues reschedule work`() {
        val receiver = BootReceiver()
        receiver.onReceive(context, Intent(Intent.ACTION_BOOT_COMPLETED))

        val workInfos = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(Constants.WORK_RESCHEDULE)
            .get()

        assertThat(workInfos).isNotEmpty()
    }

    @Test
    fun `timezone change enqueues reschedule work`() {
        BootReceiver().onReceive(context, Intent(Intent.ACTION_TIMEZONE_CHANGED))
        val workInfos = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(Constants.WORK_RESCHEDULE)
            .get()
        assertThat(workInfos).isNotEmpty()
    }

    @Test
    fun `unrelated action does not enqueue work`() {
        BootReceiver().onReceive(context, Intent("com.example.SOMETHING_ELSE"))
        val workInfos = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(Constants.WORK_RESCHEDULE)
            .get()
        assertThat(workInfos).isEmpty()
    }
}
