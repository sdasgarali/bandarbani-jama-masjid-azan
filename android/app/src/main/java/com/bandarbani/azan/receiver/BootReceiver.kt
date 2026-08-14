package com.bandarbani.azan.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.bandarbani.azan.work.RescheduleWorker

/**
 * Re-arms all alarms after events that invalidate previously-armed exact alarms:
 *  - BOOT_COMPLETED / LOCKED_BOOT_COMPLETED : alarms are cleared on reboot.
 *  - MY_PACKAGE_REPLACED : app update clears alarms.
 *  - TIME_SET / TIMEZONE_CHANGED : wall-clock times must be recomputed (DST/date/tz change).
 *
 * We hand off to WorkManager (RescheduleWorker) rather than doing Room I/O directly here, so the
 * work survives this short-lived broadcast and gets WorkManager's retry guarantees.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> {
                Log.i(TAG, "Received $action → enqueue reschedule.")
                RescheduleWorker.enqueue(context)
            }
            else -> Log.d(TAG, "Ignoring action $action")
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
