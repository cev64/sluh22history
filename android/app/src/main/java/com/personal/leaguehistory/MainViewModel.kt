package com.personal.leaguehistory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import com.personal.leaguehistory.di.ServiceLocator
import com.personal.leaguehistory.domain.model.AppSettings
import com.personal.leaguehistory.domain.repository.SettingsRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Owns the settings the whole app is themed from. */
class MainViewModel(settingsRepository: SettingsRepository) : ViewModel() {

    /** Guards the splash screen: true once the stored preferences have arrived. */
    var isReady: Boolean = false
        private set

    val settings: StateFlow<AppSettings> = settingsRepository.settings
        .onEach { isReady = true }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = AppSettings()
        )

    init {
        // DataStore's first read is a disk hit; if it fails outright the splash
        // must still release rather than hanging on a black screen.
        viewModelScope.launch {
            kotlinx.coroutines.delay(SPLASH_TIMEOUT_MS)
            isReady = true
        }
    }

    companion object {
        private const val SPLASH_TIMEOUT_MS = 700L

        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val application = checkNotNull(this[APPLICATION_KEY])
                MainViewModel(ServiceLocator.settingsRepository(application))
            }
        }
    }
}
