package com.bandarbani.azan.di

import com.bandarbani.azan.data.prefs.SettingsStore
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.notifications.NotificationHelper
import com.bandarbani.azan.scheduling.AlarmScheduler
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Hilt entry point so BroadcastReceivers (which are not @AndroidEntryPoint-injectable for fields in
 * a clean way across all APIs) can pull dependencies from the singleton graph.
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface ReceiverEntryPoint {
    fun repository(): AzanRepository
    fun alarmScheduler(): AlarmScheduler
    fun notificationHelper(): NotificationHelper
    fun settingsStore(): SettingsStore
}
