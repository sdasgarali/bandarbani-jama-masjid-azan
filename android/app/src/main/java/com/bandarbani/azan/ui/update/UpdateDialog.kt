package com.bandarbani.azan.ui.update

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.bandarbani.azan.update.UpdateManager
import java.util.Locale

/**
 * Reusable "Update available" dialog for the in-app auto-updater. It renders directly from the
 * [UpdateManager.State] so both Home and Settings can share one component.
 *
 * Behaviour:
 *  - versionName + notes + human size shown.
 *  - Idle/Available/Error → "Update now" (starts download).
 *  - Downloading           → progress bar + percent, primary button disabled.
 *  - ReadyToInstall        → "Install".
 *  - Mandatory updates hide "Later" and cannot be dismissed (back / outside tap).
 *
 * @param state       current updater state; the dialog shows only when [info] is non-null.
 * @param info        the pending update (drives title/notes even before download starts).
 * @param onUpdate    start (or continue) the download.
 * @param onInstall   launch the installer for the ready file.
 * @param onDismiss   user chose "Later" / dismissed (ignored when mandatory).
 */
@Composable
fun UpdateDialog(
    state: UpdateManager.State,
    onUpdate: () -> Unit,
    onInstall: () -> Unit,
    onDismiss: () -> Unit,
) {
    val info = when (state) {
        is UpdateManager.State.Available -> state.info
        is UpdateManager.State.Downloading -> state.info
        is UpdateManager.State.ReadyToInstall -> state.info
        is UpdateManager.State.Error -> state.info
        else -> null
    } ?: return

    val downloading = state as? UpdateManager.State.Downloading
    val ready = state as? UpdateManager.State.ReadyToInstall
    val error = state as? UpdateManager.State.Error
    val mandatory = info.mandatory

    AlertDialog(
        onDismissRequest = { if (!mandatory) onDismiss() },
        properties = DialogProperties(
            dismissOnBackPress = !mandatory,
            dismissOnClickOutside = !mandatory,
        ),
        title = { Text("Update available") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "Version ${info.versionName}",
                    style = MaterialTheme.typography.titleMedium,
                )
                if (info.sizeBytes > 0) {
                    Text(
                        "Download size: ${formatSize(info.sizeBytes)}",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!info.notes.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(info.notes, style = MaterialTheme.typography.bodyMedium)
                }
                if (mandatory) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "This update is required to keep using the app.",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (downloading != null) {
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(
                        progress = { downloading.percent / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        "Downloading… ${downloading.percent}%",
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Download failed: ${error.message}",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            when {
                ready != null -> TextButton(onClick = onInstall) { Text("Install") }
                downloading != null -> TextButton(onClick = {}, enabled = false) {
                    Text("Downloading…")
                }
                else -> TextButton(onClick = onUpdate) {
                    Text(if (error != null) "Retry" else "Update now")
                }
            }
        },
        dismissButton = {
            // Never allow "Later" for mandatory updates or mid-download.
            if (!mandatory && downloading == null) {
                TextButton(onClick = onDismiss) { Text("Later") }
            }
        },
    )
}

/** Human-readable byte size (B / KB / MB). */
private fun formatSize(bytes: Long): String {
    if (bytes <= 0) return "—"
    val kb = bytes / 1024.0
    val mb = kb / 1024.0
    return when {
        mb >= 1.0 -> String.format(Locale.getDefault(), "%.1f MB", mb)
        kb >= 1.0 -> String.format(Locale.getDefault(), "%.0f KB", kb)
        else -> "$bytes B"
    }
}
