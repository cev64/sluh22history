package com.personal.leaguehistory.ui.screens.settings

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.personal.leaguehistory.BuildConfig
import com.personal.leaguehistory.R
import com.personal.leaguehistory.domain.model.HapticStrength
import com.personal.leaguehistory.domain.model.ThemeMode
import com.personal.leaguehistory.ui.components.SectionCard
import com.personal.leaguehistory.ui.haptics.Feedback
import com.personal.leaguehistory.ui.haptics.hapticClickable
import com.personal.leaguehistory.ui.haptics.rememberHaptics

@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory)
) {
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val safeInsets = WindowInsets.safeDrawing.asPaddingValues()
    val haptics = rememberHaptics()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(
            top = safeInsets.calculateTopPadding() + 12.dp,
            bottom = safeInsets.calculateBottomPadding() + 24.dp
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item(key = "appearance") {
            SectionCard(
                title = stringResource(R.string.settings_appearance),
                icon = "🎨",
                modifier = Modifier.padding(horizontal = 12.dp)
            ) {
                ThemeMode.entries.forEach { mode ->
                    ChoiceRow(
                        label = stringResource(
                            when (mode) {
                                ThemeMode.SYSTEM -> R.string.settings_theme_system
                                ThemeMode.LIGHT -> R.string.settings_theme_light
                                ThemeMode.DARK -> R.string.settings_theme_dark
                            }
                        ),
                        selected = settings.themeMode == mode,
                        onClick = { viewModel.setThemeMode(mode) }
                    )
                }

                // Dynamic colour is a platform feature from Android 12 onward;
                // hiding the row below that avoids offering a dead switch.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    ToggleRow(
                        label = stringResource(R.string.settings_dynamic_color),
                        summary = stringResource(R.string.settings_dynamic_color_summary),
                        checked = settings.useDynamicColor,
                        onCheckedChange = { enabled ->
                            haptics.perform(Feedback.Toggle)
                            viewModel.setDynamicColor(enabled)
                        }
                    )
                }
            }
        }

        item(key = "feedback") {
            SectionCard(
                title = stringResource(R.string.settings_feedback),
                icon = "📳",
                modifier = Modifier.padding(horizontal = 12.dp)
            ) {
                HapticStrength.entries.forEach { strength ->
                    ChoiceRow(
                        label = stringResource(
                            when (strength) {
                                HapticStrength.OFF -> R.string.settings_haptics_off
                                HapticStrength.SUBTLE -> R.string.settings_haptics_subtle
                                HapticStrength.FULL -> R.string.settings_haptics_full
                            }
                        ),
                        selected = settings.hapticStrength == strength,
                        onClick = {
                            viewModel.setHapticStrength(strength)
                            // Preview the choice immediately, unless it is Off.
                            if (strength != HapticStrength.OFF) haptics.perform(Feedback.Confirm)
                        }
                    )
                }
            }
        }

        item(key = "about") {
            SectionCard(
                title = stringResource(R.string.settings_about),
                icon = "ℹ️",
                modifier = Modifier.padding(horizontal = 12.dp)
            ) {
                InfoRow(
                    label = stringResource(R.string.settings_version),
                    value = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"
                )
                InfoRow(
                    label = stringResource(R.string.settings_data_source),
                    value = stringResource(R.string.settings_data_source_summary)
                )
            }
        }
    }
}

@Composable
private fun ChoiceRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .hapticClickable(feedback = Feedback.Select, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ToggleRow(
    label: String,
    summary: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
