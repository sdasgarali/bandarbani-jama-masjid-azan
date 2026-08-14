package com.bandarbani.azan.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.bandarbani.azan.data.prefs.DeviceCredentialStore
import com.bandarbani.azan.ui.theme.BandarbaniAzanTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var credentials: DeviceCredentialStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val start = if (credentials.onboardingComplete) Routes.HOME else Routes.ONBOARDING

        setContent {
            BandarbaniAzanTheme {
                AzanNavHost(startDestination = start)
            }
        }
    }
}
