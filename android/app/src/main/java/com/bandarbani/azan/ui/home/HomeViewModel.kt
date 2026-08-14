package com.bandarbani.azan.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bandarbani.azan.data.prefs.SettingsStore
import com.bandarbani.azan.data.repository.AzanRepository
import com.bandarbani.azan.domain.PrayerScheduleView
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.delay

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

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: AzanRepository,
    private val settings: SettingsStore,
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
}
