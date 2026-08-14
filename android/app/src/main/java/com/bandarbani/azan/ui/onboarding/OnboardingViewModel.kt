package com.bandarbani.azan.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bandarbani.azan.data.prefs.DeviceCredentialStore
import com.bandarbani.azan.domain.DeviceRegistrar
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class OnboardingStage { INTRO, NOTIFICATIONS, EXACT_ALARM, SETUP, DONE }

data class OnboardingUiState(
    val stage: OnboardingStage = OnboardingStage.INTRO,
    val setupStepLabel: String? = null,
    val setupError: String? = null,
    val working: Boolean = false,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val registrar: DeviceRegistrar,
    private val credentials: DeviceCredentialStore,
) : ViewModel() {

    private val _state = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = _state.asStateFlow()

    fun goTo(stage: OnboardingStage) {
        _state.value = _state.value.copy(stage = stage, setupError = null)
    }

    /** Runs register → token → sync → audio → schedule; updates step labels for the UI. */
    fun runSetup(onFinished: () -> Unit) {
        if (_state.value.working) return
        _state.value = _state.value.copy(
            stage = OnboardingStage.SETUP, working = true, setupError = null,
        )
        viewModelScope.launch {
            val ok = registrar.runOnboardingFlow { step ->
                val label = when (step) {
                    DeviceRegistrar.Step.Registering -> "Registering device…"
                    DeviceRegistrar.Step.FetchingToken -> "Getting notification token…"
                    DeviceRegistrar.Step.Syncing -> "Syncing prayer schedule…"
                    DeviceRegistrar.Step.Scheduling -> "Scheduling Azan alarms…"
                    DeviceRegistrar.Step.Done -> "Done"
                    is DeviceRegistrar.Step.Failed -> null
                }
                if (step is DeviceRegistrar.Step.Failed) {
                    _state.value = _state.value.copy(setupError = step.message, working = false)
                } else {
                    _state.value = _state.value.copy(setupStepLabel = label)
                }
            }
            if (ok) {
                _state.value = _state.value.copy(stage = OnboardingStage.DONE, working = false)
                onFinished()
            } else {
                _state.value = _state.value.copy(working = false)
            }
        }
    }

    val isOnboardingComplete: Boolean get() = credentials.onboardingComplete
}
