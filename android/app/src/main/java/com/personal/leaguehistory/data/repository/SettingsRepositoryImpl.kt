package com.personal.leaguehistory.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.personal.leaguehistory.domain.model.AppSettings
import com.personal.leaguehistory.domain.model.HapticStrength
import com.personal.leaguehistory.domain.model.ThemeMode
import com.personal.leaguehistory.domain.repository.SettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsRepositoryImpl(private val context: Context) : SettingsRepository {

    private object Keys {
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val DYNAMIC_COLOR = booleanPreferencesKey("dynamic_color")
        val HAPTIC_STRENGTH = stringPreferencesKey("haptic_strength")
    }

    override val settings: Flow<AppSettings> = context.settingsDataStore.data
        .catch { error ->
            // A corrupt preferences file should cost the user their settings,
            // not the whole app.
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map { preferences ->
            AppSettings(
                themeMode = preferences[Keys.THEME_MODE]
                    ?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() }
                    ?: ThemeMode.SYSTEM,
                useDynamicColor = preferences[Keys.DYNAMIC_COLOR] ?: true,
                hapticStrength = preferences[Keys.HAPTIC_STRENGTH]
                    ?.let { runCatching { HapticStrength.valueOf(it) }.getOrNull() }
                    ?: HapticStrength.FULL
            )
        }

    override suspend fun setThemeMode(mode: ThemeMode) {
        context.settingsDataStore.edit { it[Keys.THEME_MODE] = mode.name }
    }

    override suspend fun setDynamicColor(enabled: Boolean) {
        context.settingsDataStore.edit { it[Keys.DYNAMIC_COLOR] = enabled }
    }

    override suspend fun setHapticStrength(strength: HapticStrength) {
        context.settingsDataStore.edit { it[Keys.HAPTIC_STRENGTH] = strength.name }
    }
}
