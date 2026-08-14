package com.bandarbani.azan.permissions

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat

/**
 * Central place for permission / OS-setting checks and the intents to remedy them. Each function
 * documents WHY the permission is needed so the onboarding UI can explain it to the user.
 */
object PermissionUtils {

    /**
     * POST_NOTIFICATIONS (API 33+): required to show prayer-time notifications and the playback
     * foreground-service notification. Below 33 it is granted implicitly.
     */
    fun hasNotificationPermission(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context, android.Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

    /** Runtime permission string, or null if not needed on this API level. */
    fun notificationPermissionOrNull(): String? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            android.Manifest.permission.POST_NOTIFICATIONS
        } else {
            null
        }

    /**
     * Exact alarms (API 31+): SCHEDULE_EXACT_ALARM must be granted or exact alarms are downgraded.
     * We check canScheduleExactAlarms() and, if false, deep-link the user to the setting.
     */
    fun canScheduleExactAlarms(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return am.canScheduleExactAlarms()
    }

    /** Intent to the system's "Alarms & reminders" screen for this app (API 31+). */
    fun exactAlarmSettingsIntent(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        return Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
            data = Uri.fromParts("package", context.packageName, null)
        }
    }

    /**
     * Battery optimization: the app works via setAlarmClock even when optimized, but whitelisting
     * improves reliability on aggressive OEMs. We only guide — never force.
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun batteryOptimizationSettingsIntent(): Intent =
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)

    /** Direct request to whitelist THIS app (may be rejected by policy on some devices). */
    fun requestIgnoreBatteryOptimizationIntent(context: Context): Intent =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
}
