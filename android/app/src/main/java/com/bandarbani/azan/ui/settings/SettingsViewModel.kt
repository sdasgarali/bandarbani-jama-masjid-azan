package com.bandarbani.azan.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bandarbani.azan.BuildConfig
import com.bandarbani.azan.data.local.entity.PrayerTimeEntity
import com.bandarbani.azan.data.prefs.SettingsStore
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.permissions.PermissionUtils
import com.bandarbani.azan.update.UpdateManager
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
    val appVersionCode: Int = BuildConfig.VERSION_CODE,
    val apiBaseUrl: String = BuildConfig.API_BASE_URL,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: AzanRepository,
    private val settings: SettingsStore,
    private val updateManager: UpdateManager,
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

    // ---- In-app auto-update ----

    /** Shared updater state (see [UpdateManager.State]). */
    val updateState: StateFlow<UpdateManager.State> = updateManager.state

    private val _updateDialogVisible = MutableStateFlow(false)
    val updateDialogVisible: StateFlow<Boolean> = _updateDialogVisible.asStateFlow()

    /** True once a manual check completed and found no newer version (drives the "up to date" msg). */
    private val _upToDate = MutableStateFlow(false)
    val upToDate: StateFlow<Boolean> = _upToDate.asStateFlow()

    private val _checking = MutableStateFlow(false)
    val checking: StateFlow<Boolean> = _checking.asStateFlow()

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

    /** Manual "Check for updates": shows the dialog if a newer version exists, else "up to date". */
    fun checkForUpdates() {
        _upToDate.value = false
        _checking.value = true
        viewModelScope.launch {
            val info = updateManager.checkForUpdate()
            _checking.value = false
            if (info != null) {
                _updateDialogVisible.value = true
            } else {
                _upToDate.value = true
            }
        }
    }

    fun startDownload() {
        val info = when (val s = updateState.value) {
            is UpdateManager.State.Available -> s.info
            is UpdateManager.State.Downloading -> s.info
            is UpdateManager.State.ReadyToInstall -> s.info
            is UpdateManager.State.Error -> s.info
            else -> null
        } ?: return
        _updateDialogVisible.value = true
        viewModelScope.launch { runCatching { updateManager.downloadApk(info) } }
    }

    fun install() {
        val ready = updateState.value as? UpdateManager.State.ReadyToInstall ?: return
        updateManager.installApk(context, ready.file)
    }

    fun dismissUpdateDialog() {
        _updateDialogVisible.value = false
    }
}
