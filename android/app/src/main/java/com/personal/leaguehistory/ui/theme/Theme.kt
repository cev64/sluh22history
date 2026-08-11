package com.personal.leaguehistory.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.personal.leaguehistory.domain.model.ThemeMode

private val LightScheme = lightColorScheme(
    primary = LeagueBlue,
    onPrimary = Color.White,
    primaryContainer = LeagueBlueSoft,
    onPrimaryContainer = LeagueBlueDeep,
    secondary = NavyLift,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE1E9F3),
    onSecondaryContainer = Navy,
    tertiary = GoldDeep,
    onTertiary = Color.White,
    tertiaryContainer = GoldSoft,
    onTertiaryContainer = Color(0xFF4A3200),
    error = LeagueRed,
    onError = Color.White,
    errorContainer = LeagueRedSoft,
    onErrorContainer = Color(0xFF6B0F0F),
    background = SurfaceLight,
    onBackground = Ink,
    surface = SurfaceLight,
    onSurface = Ink,
    surfaceVariant = Color(0xFFE7ECF3),
    onSurfaceVariant = Muted,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFAFBFD),
    surfaceContainer = PanelLight,
    surfaceContainerHigh = Color(0xFFEFF3F8),
    surfaceContainerHighest = Color(0xFFE9EEF5),
    outline = Color(0xFFB9C4D2),
    outlineVariant = LineLight,
    inverseSurface = Navy,
    inverseOnSurface = Color(0xFFEDF2F8),
    inversePrimary = BlueLightOnDark
)

private val DarkScheme = darkColorScheme(
    primary = BlueLightOnDark,
    onPrimary = Color(0xFF00306B),
    primaryContainer = Color(0xFF14457F),
    onPrimaryContainer = Color(0xFFD8E5FF),
    secondary = Color(0xFFB6C6DC),
    onSecondary = Color(0xFF203042),
    secondaryContainer = Color(0xFF2A3B50),
    onSecondaryContainer = Color(0xFFD5E1F1),
    tertiary = GoldLightOnDark,
    onTertiary = Color(0xFF3F2A00),
    tertiaryContainer = Color(0xFF5C4000),
    onTertiaryContainer = GoldSoft,
    error = RedLightOnDark,
    onError = Color(0xFF5A0F0F),
    errorContainer = Color(0xFF7D1D1D),
    onErrorContainer = Color(0xFFFFDCDC),
    background = DarkSurface,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = Color(0xFF2A3646),
    onSurfaceVariant = DarkMuted,
    surfaceContainerLowest = Color(0xFF070E17),
    surfaceContainerLow = Color(0xFF101A26),
    surfaceContainer = DarkSurfaceContainer,
    surfaceContainerHigh = DarkSurfaceContainerHigh,
    surfaceContainerHighest = Color(0xFF223349),
    outline = Color(0xFF63758B),
    outlineVariant = DarkLine,
    inverseSurface = Color(0xFFE6EDF5),
    inverseOnSurface = Navy,
    inversePrimary = LeagueBlue
)

/**
 * Accent colours that carry meaning in the record book (a trophy is gold, a
 * last-place finish is red) and must survive dynamic colour, which would
 * otherwise repaint them with the wallpaper palette.
 */
@Immutable
data class LeagueAccents(
    val champion: Color,
    val championContainer: Color,
    val onChampionContainer: Color,
    val loser: Color,
    val loserContainer: Color,
    val onLoserContainer: Color,
    val positive: Color,
    val negative: Color,
    val heroStart: Color,
    val heroEnd: Color,
    val onHero: Color
)

private val LightAccents = LeagueAccents(
    champion = GoldDeep,
    championContainer = GoldSoft,
    onChampionContainer = Color(0xFF4A3200),
    loser = LeagueRed,
    loserContainer = LeagueRedSoft,
    onLoserContainer = Color(0xFF6B0F0F),
    positive = LeagueGreen,
    negative = LeagueRed,
    heroStart = Color(0xFF0C1D30),
    heroEnd = Color(0xFF1D3551),
    onHero = Color.White
)

private val DarkAccents = LeagueAccents(
    champion = GoldLightOnDark,
    championContainer = Color(0xFF4A3200),
    onChampionContainer = GoldSoft,
    loser = RedLightOnDark,
    loserContainer = Color(0xFF5A1717),
    onLoserContainer = Color(0xFFFFDCDC),
    positive = GreenLightOnDark,
    negative = RedLightOnDark,
    heroStart = Color(0xFF0A1523),
    heroEnd = Color(0xFF16283C),
    onHero = Color(0xFFEAF1F9)
)

val LocalLeagueAccents = staticCompositionLocalOf { LightAccents }

/** Convenience accessor mirroring `MaterialTheme.colorScheme`. */
object LeagueTheme {
    val accents: LeagueAccents
        @Composable get() = LocalLeagueAccents.current
}

@Composable
fun LeagueHistoryTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    useDynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val darkTheme = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }

    val context = LocalContext.current
    val dynamicAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    val colorScheme = when {
        useDynamicColor && dynamicAvailable && darkTheme -> dynamicDarkColorScheme(context)
        useDynamicColor && dynamicAvailable -> dynamicLightColorScheme(context)
        darkTheme -> DarkScheme
        else -> LightScheme
    }

    CompositionLocalProvider(
        LocalLeagueAccents provides if (darkTheme) DarkAccents else LightAccents
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = AppTypography,
            content = content
        )
    }
}
