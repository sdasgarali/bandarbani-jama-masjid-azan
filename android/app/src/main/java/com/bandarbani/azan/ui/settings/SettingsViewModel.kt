package com.bandarbani.azan.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bandarbani.azan.BuildConfig
import com.bandarbani.azan.data.local.entity.PrayerTimeEntity
import com.bandarbani.azan.data.prefs.SettingsStore
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.permissions.PermissionUtils
import com.bandarbani.azan.work.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val masterAzanEnabled: Boolean = true,
    val notificationsEnabled: Boolean = true,
    val prayers: List<PrayerTimeEntity> = emptyList(),
    val timezone: String = "",
    val scheduleVersion: Int? = null,
    val exactAlarmsAllowed: Boolean = true,
    val batteryOptimized: Boolean = false,
    val appVersion: String = BuildConfig.VERSION_NAME,
    val apiBaseUrl: String = BuildConfig.API_BASE_URL,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: AzanRepository,
    private val settings: SettingsStore,
) : ViewModel() {

    // Recomputed on each screen resume via refreshPermissionState().
    private val permissionState = MutableStateFlow(
        Pair(
            PermissionUtils.canScheduleExactAlarms(context),
            PermissionUtils.isIgnoringBatteryOptimizations(context),
        ),
    )

    val uiState: StateFlow<SettingsUiState> =
        combine(
            repository.observeSchedule(),
            repository.observePrayerTimes(),
            settings.masterAzanEnabled,
            settings.notificationsEnabled,
            permissionState,
        ) { schedule, prayers, masterAzan, notifs, perms ->
            SettingsUiState(
                masterAzanEnabled = masterAzan,
                notificationsEnabled = notifs,
                prayers = prayers.sortedBy { it.prayer.ordinal },
                timezone = schedule?.timezone ?: "",
                scheduleVersion = schedule?.version,
                exactAlarmsAllowed = perms.first,
                batteryOptimized = !perms.second,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = SettingsUiState(),
        )

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    fun refreshPermissionState() {
        permissionState.value = Pair(
            PermissionUtils.canScheduleExactAlarms(context),
            PermissionUtils.isIgnoringBatteryOptimizations(context),
        )
    }

    fun setMasterAzan(enabled: Boolean) {
        viewModelScope.launch { settings.setMasterAzanEnabled(enabled) }
    }

    fun setNotifications(enabled: Boolean) {
        viewModelScope.launch { settings.setNotificationsEnabled(enabled) }
    }

    fun syncNow() {
        SyncWorker.enqueueOneShot(context)
    }
}
