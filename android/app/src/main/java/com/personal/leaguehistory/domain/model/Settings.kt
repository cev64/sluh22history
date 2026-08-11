package com.personal.leaguehistory.domain.model

enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** How strongly the app should buzz. Off is a genuine off, not a quieter buzz. */
enum class HapticStrength { OFF, SUBTLE, FULL }

data class AppSettings(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val useDynamicColor: Boolean = true,
    val hapticStrength: HapticStrength = HapticStrength.FULL
)
