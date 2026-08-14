package com.bandarbani.azan.ui.settings

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bandarbani.azan.core.Prayer
import com.bandarbani.azan.permissions.PermissionUtils
import com.bandarbani.azan.ui.update.UpdateDialog
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val updateState by viewModel.updateState.collectAsStateWithLifecycle()
    val updateDialogVisible by viewModel.updateDialogVisible.collectAsStateWithLifecycle()
    val checkingUpdates by viewModel.checking.collectAsStateWithLifecycle()
    val upToDate by viewModel.upToDate.collectAsStateWithLifecycle()
    val context = LocalContext.current

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
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Master azan switch
            SettingCard("Azan") {
                ToggleRow(
                    label = "Play Azan on this device",
                    checked = state.masterAzanEnabled,
                    onCheckedChange = viewModel::setMasterAzan,
                )
                ToggleRow(
                    label = "Show prayer notifications",
                    checked = state.notificationsEnabled,
                    onCheckedChange = viewModel::setNotifications,
                )
            }

            // Per-prayer (published) status — read-only, controlled by the admin.
            SettingCard("Prayer times (published by admin)") {
                if (state.prayers.isEmpty()) {
                    Text("No schedule yet.")
                } else {
                    state.prayers.forEach { p ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(prayerLabel(p.prayer), fontWeight = FontWeight.Medium)
                            Text(
                                buildString {
                                    append(p.time)
                                    if (!p.enabled) append("  (disabled)")
                                    else if (!p.audioEnabled) append("  (silent)")
                                },
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                Text(
                    "Version: ${state.scheduleVersion ?: "—"}  •  ${state.timezone}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Sync
            SettingCard("Sync") {
                Button(onClick = viewModel::syncNow, modifier = Modifier.fillMaxWidth()) {
                    Text("Synchronize now")
                }
            }

            // Permissions & reliability
            SettingCard("Reliability") {
                if (!state.exactAlarmsAllowed) {
                    Text(
                        "Exact alarms are OFF. Azan may be delayed. Grant \"Alarms & reminders\" so prayers fire on time.",
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = {
                            PermissionUtils.exactAlarmSettingsIntent(context)?.let {
                                context.startActivity(it)
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Allow exact alarms") }
                } else {
                    Text("Exact alarms: allowed ✓")
                }
                Spacer(Modifier.height(12.dp))
                if (state.batteryOptimized) {
                    Text(
                        "Battery optimization is ON for this app. On some phones this can delay the Azan. Consider allowing it to run unrestricted.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = {
                            runCatching {
                                context.startActivity(
                                    PermissionUtils.requestIgnoreBatteryOptimizationIntent(context),
                                )
                            }.onFailure {
                                context.startActivity(
                                    PermissionUtils.batteryOptimizationSettingsIntent()
                                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Optimize reliability") }
                } else {
                    Text("Battery: unrestricted ✓")
                }
            }

            // Location placeholder (future)
            SettingCard("Location") {
                Text(
                    "Location-based prayer calculation is not enabled in this version. Times are set by the mosque admin.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // App info + in-app updates
            SettingCard("App info") {
                Text("Version: ${state.appVersion} (build ${state.appVersionCode})")
                Text(
                    "API: ${state.apiBaseUrl}",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = viewModel::checkForUpdates,
                    enabled = !checkingUpdates,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (checkingUpdates) {
                        CircularProgressIndicator(
                            modifier = Modifier.height(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Text("  Checking…")
                    } else {
                        Text("Check for updates")
                    }
                }
                if (upToDate) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "You're up to date (v${state.appVersion}).",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Divider(Modifier.padding(vertical = 8.dp))
            content()
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

private fun prayerLabel(prayer: Prayer): String =
    prayer.name.lowercase().replaceFirstChar { it.titlecase(Locale.getDefault()) }
