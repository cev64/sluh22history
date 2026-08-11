package com.personal.leaguehistory.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.personal.leaguehistory.R

/**
 * Space Grotesk ships as a single variable font, so each weight is one axis
 * setting on the same file rather than a separate resource.
 */
private fun spaceGrotesk(weight: Int) = Font(
    resId = R.font.space_grotesk,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight))
)

val DisplayFontFamily = FontFamily(
    spaceGrotesk(500),
    spaceGrotesk(600),
    spaceGrotesk(700)
)

/**
 * Display styles use Space Grotesk (matching the site's headings); body and
 * label styles stay on the platform font, which keeps long tables legible and
 * respects the user's font-scaling choice.
 */
val AppTypography = Typography().run {
    copy(
        displayLarge = displayLarge.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.Bold),
        displayMedium = displayMedium.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.Bold),
        displaySmall = displaySmall.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.Bold),
        headlineLarge = headlineLarge.copy(
            fontFamily = DisplayFontFamily,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.5).sp
        ),
        headlineMedium = headlineMedium.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.Bold),
        headlineSmall = headlineSmall.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.SemiBold),
        titleLarge = titleLarge.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.Bold),
        titleMedium = titleMedium.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.SemiBold),
        titleSmall = titleSmall.copy(fontFamily = DisplayFontFamily, fontWeight = FontWeight.SemiBold)
    )
}

/** The site's all-caps micro label above section headings. */
val EyebrowStyle = TextStyle(
    fontFamily = DisplayFontFamily,
    fontWeight = FontWeight.Bold,
    fontSize = 11.sp,
    letterSpacing = 1.4.sp
)

/** Tabular figures for standings columns, so digits line up down a column. */
val StatNumberStyle = TextStyle(
    fontFamily = DisplayFontFamily,
    fontWeight = FontWeight.Bold,
    fontSize = 15.sp
)
