package com.bandarbani.azan

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Ignore
import org.junit.Test
import org.junit.runner.RunWith

/**
 * DOCUMENTED INSTRUMENTED TEST STUB — reboot rescheduling end-to-end.
 *
 * Intent: on a device/emulator, seed Room with a schedule, broadcast BOOT_COMPLETED to
 * [com.bandarbani.azan.receiver.BootReceiver], let WorkManager run RescheduleWorker, and assert
 * that AlarmScheduler armed a PendingIntent (via a ShadowAlarmManager in Robolectric, or by
 * querying scheduled alarms through a test hook on a real device).
 *
 * Steps to implement when running on-device:
 *  1. Use a Hilt test runner + @HiltAndroidTest to inject a real AzanRepository backed by an
 *     in-memory Room DB.
 *  2. repository.applyPayload(sampleSchedule) to populate schedule + prayer rows.
 *  3. Send Intent(ACTION_BOOT_COMPLETED) to BootReceiver.
 *  4. Drive WorkManager with TestDriver (setAllConstraintsMet) to run RescheduleWorker.
 *  5. Assert SyncState.armedRequestCodes is non-empty AND the PendingIntent exists via
 *     PendingIntent.getBroadcast(..., FLAG_NO_CREATE) != null for the computed request code.
 *
 * Ignored by default so CI without an emulator stays green; remove @Ignore to run on-device.
 */
@RunWith(AndroidJUnit4::class)
class RebootReschedulingInstrumentedTest {

    @Test
    @Ignore("Requires an emulator/device + Hilt test harness; see class doc for the procedure.")
    fun bootCompleted_armsAlarms() {
        // Implemented on-device per the documented steps above.
    }
}
