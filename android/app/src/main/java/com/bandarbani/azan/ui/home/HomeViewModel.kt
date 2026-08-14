package com.bandarbani.azan.ui.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bandarbani.azan.data.prefs.SettingsStore
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.domain.PrayerScheduleView
import com.bandarbani.azan.update.UpdateInfo
import com.bandarbani.azan.update.UpdateManager
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class HomeUiState(
    val loading: Boolean = true,
    val timezone: String = ZoneId.systemDefault().id,
    val today: LocalDate = LocalDate.now(),
    val scheduleView: PrayerScheduleView.State? = null,
    val masterAzanEnabled: Boolean = true,
    val lastSyncResult: String? = null,
    val lastSyncAt: Long? = null,
    val hasSchedule: Boolean = false,
)

/** Minimal UI model for the "next upcoming announcement" chip on Home. */
data class NextAnnouncementUi(
    val label: String,
    val scheduledAtEpochMillis: Long,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: AzanRepository,
    private val settings: SettingsStore,
    private val updateManager: UpdateManager,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    /** A 1Hz ticker so the countdown updates live. */
    private val ticker = flow {
        while (true) {
            emit(Instant.now())
            delay(1000)
        }
    }

    val uiState: StateFlow<HomeUiState> =
        combine(
            repository.observeSchedule(),
            repository.observePrayerTimes(),
            repository.observeSyncState(),
            settings.masterAzanEnabled,
            ticker,
        ) { schedule, prayers, syncState, masterAzan, now ->
            val zone = schedule?.timezone?.let {
                runCatching { ZoneId.of(it) }.getOrDefault(ZoneId.systemDefault())
            } ?: ZoneId.systemDefault()

            // Room orders by the enum's stored NAME (alphabetical); re-sort by liturgical ordinal.
            val ordered = prayers.sortedBy { it.prayer.ordinal }
            val view = if (ordered.isNotEmpty()) {
                PrayerScheduleView.compute(
                    prayerTimes = ordered.map { Triple(it.prayer, it.time, it.enabled && it.audioEnabled) },
                    zone = zone,
                    now = now,
                )
            } else {
                null
            }

            HomeUiState(
                loading = false,
                timezone = zone.id,
                today = now.atZone(zone).toLocalDate(),
                scheduleView = view,
                masterAzanEnabled = masterAzan,
                lastSyncResult = syncState?.lastSyncResult,
                lastSyncAt = syncState?.lastSyncAt,
                hasSchedule = schedule != null,
            )
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = HomeUiState(),
        )

    /**
     * The soonest enabled announcement still in the future, or null. Combines the announcement list
     * with the 1Hz ticker so a past announcement drops off the chip without a manual refresh.
     */
    val nextAnnouncement: StateFlow<NextAnnouncementUi?> =
        combine(repository.observeEnabledAnnouncements(), ticker) { announcements, now ->
            announcements
                .filter { it.scheduledAtEpochMillis > now.toEpochMilli() }
                .minByOrNull { it.scheduledAtEpochMillis }
                ?.let {
                    NextAnnouncementUi(
                        label = it.label?.takeIf(String::isNotBlank) ?: "Announcement",
                        scheduledAtEpochMillis = it.scheduledAtEpochMillis,
                    )
                }
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = null,
        )

    // ---- In-app auto-update ----

    /** Shared updater state (Idle/Checking/Available/Downloading/ReadyToInstall/Error). */
    val updateState: StateFlow<UpdateManager.State> = updateManager.state

    /**
     * Set true once we've surfaced the dialog for a discovered update so it isn't re-shown after the
     * user taps "Later". A mandatory update ignores this and the dialog blocks use regardless.
     */
    private val _updateDialogVisible = MutableStateFlow(false)
    val updateDialogVisible: StateFlow<Boolean> = _updateDialogVisible.asStateFlow()

    /** Called once on first composition: silently check and auto-show the dialog if newer exists. */
    fun checkForUpdateOnLoad() {
        viewModelScope.launch {
            val info = updateManager.checkForUpdate()
            if (info != null) {
                _updateDialogVisible.value = true
            }
        }
    }

    fun startDownload() {
        val info = currentUpdateInfo() ?: return
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

    /** Re-open the dialog from the banner/chip tap. */
    fun showUpdateDialog() {
        _updateDialogVisible.value = true
    }

    private fun currentUpdateInfo(): UpdateInfo? = when (val s = updateState.value) {
        is UpdateManager.State.Available -> s.info
        is UpdateManager.State.Downloading -> s.info
        is UpdateManager.State.ReadyToInstall -> s.info
        is UpdateManager.State.Error -> s.info
        else -> null
    }
}
