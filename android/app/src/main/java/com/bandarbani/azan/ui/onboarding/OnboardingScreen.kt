package com.bandarbani.azan.ui.onboarding

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bandarbani.azan.permissions.PermissionUtils

/**
 * First-run onboarding following the mandated order (ARCHITECTURE / prompt §8):
 * intro → notification permission → exact-alarm setting → setup (register + token + sync + audio +
 * schedule) → home.
 */
@Composable
fun OnboardingScreen(
    onComplete: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        // Regardless of grant/deny we proceed — the app degrades gracefully without notifications.
        viewModel.goTo(OnboardingStage.EXACT_ALARM)
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when (state.stage) {
                OnboardingStage.INTRO -> IntroStep(onNext = {
                    viewModel.goTo(OnboardingStage.NOTIFICATIONS)
                })

                OnboardingStage.NOTIFICATIONS -> PermissionStep(
                    title = "Notifications",
                    body = "We show a notification when it is time for each prayer, and while the " +
                        "Azan plays. Please allow notifications.",
                    primaryLabel = "Allow notifications",
                    onPrimary = {
                        val perm = PermissionUtils.notificationPermissionOrNull()
                        if (perm == null) {
                            viewModel.goTo(OnboardingStage.EXACT_ALARM)
                        } else {
                            notificationLauncher.launch(perm)
                        }
                    },
                    onSkip = { viewModel.goTo(OnboardingStage.EXACT_ALARM) },
                )

                OnboardingStage.EXACT_ALARM -> PermissionStep(
                    title = "Exact Alarms",
                    body = "To play the Azan at the precise prayer time — even when your phone is " +
                        "asleep — Android needs permission for exact alarms. Please enable " +
                        "\"Alarms & reminders\".",
                    primaryLabel = "Open alarm setting",
                    onPrimary = {
                        PermissionUtils.exactAlarmSettingsIntent(context)?.let {
                            context.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        }
                    },
                    onSkip = { viewModel.runSetup(onComplete) },
                    skipLabel = "Continue",
                )

                OnboardingStage.SETUP -> SetupStep(
                    label = state.setupStepLabel,
                    error = state.setupError,
                    onRetry = { viewModel.runSetup(onComplete) },
                )

                OnboardingStage.DONE -> {
                    // Navigation handled by onComplete; show a brief confirmation.
                    Text("All set!", style = MaterialTheme.typography.headlineMedium)
                }
            }
        }
    }
}

@Composable
private fun IntroStep(onNext: () -> Unit) {
    Text(
        "Bandarbani Jama Masjid",
        style = MaterialTheme.typography.headlineMedium,
        color = MaterialTheme.colorScheme.primary,
        textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(16.dp))
    Text(
        "This app plays the Azan at each prayer time set by the mosque. It works even when the " +
            "app is closed and offline. Let's set it up in a few steps.",
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.bodyLarge,
    )
    Spacer(Modifier.height(32.dp))
    Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text("Get started") }
}

@Composable
private fun PermissionStep(
    title: String,
    body: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    onSkip: () -> Unit,
    skipLabel: String = "Not now",
) {
    Text(title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
    Spacer(Modifier.height(16.dp))
    Text(body, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
    Spacer(Modifier.height(32.dp))
    Button(onClick = onPrimary, modifier = Modifier.fillMaxWidth()) { Text(primaryLabel) }
    Spacer(Modifier.height(8.dp))
    TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) { Text(skipLabel) }
}

@Composable
private fun SetupStep(label: String?, error: String?, onRetry: () -> Unit) {
    if (error != null) {
        Text("Setup problem", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(16.dp))
        Text(error, textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        OutlinedButton(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Retry") }
    } else {
        CircularProgressIndicator()
        Spacer(Modifier.height(24.dp))
        Text(label ?: "Setting up…", textAlign = TextAlign.Center)
    }
}
