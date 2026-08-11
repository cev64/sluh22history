package com.personal.leaguehistory.domain.repository

import com.personal.leaguehistory.domain.model.AppSettings
import com.personal.leaguehistory.domain.model.HapticStrength
import com.personal.leaguehistory.domain.model.ThemeMode
import kotlinx.coroutines.flow.Flow

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun setThemeMode(mode: ThemeMode)
    suspend fun setDynamicColor(enabled: Boolean)
    suspend fun setHapticStrength(strength: HapticStrength)
}
