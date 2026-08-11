package com.personal.leaguehistory.ui.format

import java.util.Locale

/*
 * Number formatting is deliberately identical to the web record book so a
 * screenshot of either one shows the same digits.
 */

/** Two decimal places with thousands separators, e.g. 1,821.72. */
fun formatPoints(value: Double): String = String.format(Locale.US, "%,.2f", value)

/** One decimal place, used for points-per-game. */
fun formatAverage(value: Double): String = String.format(Locale.US, "%.1f", value)

/** Win percentage as a leading-dot figure, e.g. .714 — matching the site. */
fun formatWinPct(wins: Int, losses: Int): String {
    val games = wins + losses
    if (games == 0) return ".000"
    val pct = String.format(Locale.US, "%.3f", wins.toDouble() / games)
    return pct.removePrefix("0")
}

/** Signed differential, e.g. +284.12 or -97.40. */
fun formatDifferential(value: Double): String {
    val sign = if (value >= 0) "+" else ""
    return sign + formatPoints(value)
}

fun formatRecord(wins: Int, losses: Int): String = "$wins–$losses"

fun ordinal(value: Int): String {
    val mod100 = value % 100
    if (mod100 in 11..13) return "${value}th"
    return when (value % 10) {
        1 -> "${value}st"
        2 -> "${value}nd"
        3 -> "${value}rd"
        else -> "${value}th"
    }
}

/** Repeats a trophy/poop glyph the way the site does, capped so it still fits. */
fun repeatGlyph(glyph: String, count: Int, max: Int = 5): String = when {
    count <= 0 -> ""
    count <= max -> glyph.repeat(count)
    else -> glyph
}
