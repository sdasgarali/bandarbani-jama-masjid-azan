package com.bandarbani.azan.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.domain.PrayerScheduleView
import com.bandarbani.azan.update.UpdateManager
import com.bandarbani.azan.ui.update.UpdateDialog
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenSettings: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val updateState by viewModel.updateState.collectAsStateWithLifecycle()
    val updateDialogVisible by viewModel.updateDialogVisible.collectAsStateWithLifecycle()

    // Check for an app update once when Home is first shown (offline-safe; never blocks the UI).
    LaunchedEffect(Unit) { viewModel.checkForUpdateOnLoad() }

    if (updateDialogVisible) {
        UpdateDialog(
            state = updateState,
            onUpdate = viewModel::startDownload,
            onInstall = viewModel::install,
            onDismiss = viewModel::dismissUpdateDialog,
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Bandarbani Jama Masjid") },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
        },
    ) { padding ->
        if (state.loading) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) { CircularProgressIndicator() }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val updateInfo = updateState.availableInfo()
            if (updateInfo != null) {
                UpdateBanner(
                    versionName = updateInfo.versionName,
                    onClick = viewModel::showUpdateDialog,
                )
            }
            DateHeader(state)
            NextPrayerCard(state)
            TodayTimesCard(state)
            StatusCard(state)
        }
    }
}

/** Returns the pending [com.bandarbani.azan.update.UpdateInfo] for any non-idle updater state. */
private fun UpdateManager.State.availableInfo() = when (this) {
    is UpdateManager.State.Available -> info
    is UpdateManager.State.Downloading -> info
    is UpdateManager.State.ReadyToInstall -> info
    is UpdateManager.State.Error -> info
    else -> null
}

@Composable
private fun UpdateBanner(versionName: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(Icons.Filled.SystemUpdate, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text("Update available", fontWeight = FontWeight.Bold)
                Text(
                    "Version $versionName — tap to update",
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }
    }
}

@Composable
private fun DateHeader(state: HomeUiState) {
    val formatter = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale.getDefault())
    Text(
        text = state.today.format(formatter),
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onBackground,
    )
    Text(
        text = "Timezone: ${state.timezone}",
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun NextPrayerCard(state: HomeUiState) {
    val view = state.scheduleView
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("NEXT PRAYER", style = MaterialTheme.typography.labelLarge)
            Spacer(Modifier.height(8.dp))
            if (view?.nextPrayer != null) {
                Text(
                    text = prayerLabel(view.nextPrayer),
                    style = MaterialTheme.typography.displayLarge,
                    color = MaterialTheme.colorScheme.secondaryContainer,
                )
                val nextRow = view.rows.firstOrNull { it.prayer == view.nextPrayer }
                nextRow?.let {
                    Text(it.time, style = MaterialTheme.typography.headlineMedium)
                }
                Spacer(Modifier.height(12.dp))
                Text("Time remaining", style = MaterialTheme.typography.labelLarge)
                Text(
                    text = view.timeRemaining?.let { PrayerScheduleView.formatCountdown(it) } ?: "--:--",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Text(
                    "No enabled prayers",
                    style = MaterialTheme.typography.titleLarge,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun TodayTimesCard(state: HomeUiState) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Today's Prayer Times",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(8.dp))
            val rows = state.scheduleView?.rows.orEmpty()
            if (rows.isEmpty()) {
                Text("No schedule yet. Pull to sync from Settings.")
            } else {
                val next = state.scheduleView?.nextPrayer
                rows.forEach { row ->
                    PrayerRowItem(row, isNext = row.prayer == next)
                }
            }
        }
    }
}

@Composable
private fun PrayerRowItem(row: PrayerScheduleView.PrayerRow, isNext: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = prayerLabel(row.prayer),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = if (isNext) FontWeight.Bold else FontWeight.Normal,
            color = if (isNext) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurface,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!row.enabled) {
                Text(
                    "off  ",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = row.time,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = if (isNext) FontWeight.Bold else FontWeight.Normal,
            )
        }
    }
}

@Composable
private fun StatusCard(state: HomeUiState) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            val azanStatus = if (state.masterAzanEnabled) "Enabled" else "Disabled (this device)"
            Text("Azan: $azanStatus", style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Last sync: ${state.lastSyncResult ?: "never"}",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (state.lastSyncAt != null) {
                val ts = java.time.Instant.ofEpochMilli(state.lastSyncAt)
                    .atZone(ZoneId.systemDefault())
                    .format(DateTimeFormatter.ofPattern("d MMM, HH:mm"))
                Text(
                    text = "at $ts",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun prayerLabel(prayer: Prayer): String =
    prayer.name.lowercase().replaceFirstChar { it.titlecase(Locale.getDefault()) }

@Suppress("unused")
private fun dayName(zone: ZoneId): String =
    java.time.LocalDate.now(zone).dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())
