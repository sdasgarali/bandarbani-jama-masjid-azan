package com.bandarbani.azan.data.prefs

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.settingsDataStore by preferencesDataStore(name = "user_settings")

/**
 * Device-local user preferences layered on top of the admin-published schedule.
 * The master azan switch lets the user silence all azans on THIS device without changing the
 * server schedule. Effective play = published.enabled && published.audioEnabled && masterAzanOn.
 */
@Singleton
class SettingsStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val masterAzanEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[KEY_MASTER_AZAN] ?: true }

    val notificationsEnabled: Flow<Boolean> =
        context.settingsDataStore.data.map { it[KEY_NOTIFICATIONS] ?: true }

    suspend fun setMasterAzanEnabled(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_MASTER_AZAN] = enabled }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.settingsDataStore.edit { it[KEY_NOTIFICATIONS] = enabled }
    }

    companion object {
        private val KEY_MASTER_AZAN = booleanPreferencesKey("master_azan_enabled")
        private val KEY_NOTIFICATIONS = booleanPreferencesKey("notifications_enabled")
    }
}
