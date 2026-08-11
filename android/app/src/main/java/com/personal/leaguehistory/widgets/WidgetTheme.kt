package com.personal.leaguehistory.widgets

import androidx.compose.ui.graphics.Color
import androidx.glance.material3.ColorProviders
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import com.personal.leaguehistory.ui.theme.DarkLine
import com.personal.leaguehistory.ui.theme.DarkMuted
import com.personal.leaguehistory.ui.theme.DarkOnSurface
import com.personal.leaguehistory.ui.theme.DarkSurface
import com.personal.leaguehistory.ui.theme.DarkSurfaceContainerHigh
import com.personal.leaguehistory.ui.theme.GoldLightOnDark
import com.personal.leaguehistory.ui.theme.Ink
import com.personal.leaguehistory.ui.theme.LeagueBlue
import com.personal.leaguehistory.ui.theme.LineLight
import com.personal.leaguehistory.ui.theme.Muted
import com.personal.leaguehistory.ui.theme.PanelLight

/**
 * Widget colours.
 *
 * Home-screen widgets sit on the user's wallpaper, so they follow the system
 * light/dark state rather than the in-app theme preference — a widget cannot
 * observe the app's DataStore at draw time without blocking the host.
 */
internal object WidgetTheme {

    val colors = ColorProviders(
        light = lightColorScheme(
            primary = LeagueBlue,
            onPrimary = Color.White,
            background = PanelLight,
            onBackground = Ink,
            surface = PanelLight,
            onSurface = Ink,
            surfaceVariant = Color(0xFFEFF3F8),
            onSurfaceVariant = Muted,
            outline = LineLight,
            tertiary = Color(0xFF8A5D00)
        ),
        dark = darkColorScheme(
            primary = Color(0xFF8FB6FF),
            onPrimary = Color(0xFF00306B),
            background = DarkSurface,
            onBackground = DarkOnSurface,
            surface = DarkSurface,
            onSurface = DarkOnSurface,
            surfaceVariant = DarkSurfaceContainerHigh,
            onSurfaceVariant = DarkMuted,
            outline = DarkLine,
            tertiary = GoldLightOnDark
        )
    )
}
