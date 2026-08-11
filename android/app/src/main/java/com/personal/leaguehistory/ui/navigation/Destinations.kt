package com.personal.leaguehistory.ui.navigation

import android.net.Uri
import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.ui.graphics.vector.ImageVector
import com.personal.leaguehistory.R

/** Top-level areas of the app, shown in the bottom bar or navigation rail. */
enum class TopLevelDestination(
    val route: String,
    @StringRes val labelRes: Int,
    val icon: ImageVector
) {
    RECORD_BOOK("record", R.string.nav_record_book, Icons.Filled.Star),
    SEASONS("seasons", R.string.nav_seasons, Icons.Filled.DateRange),
    SETTINGS("settings", R.string.nav_settings, Icons.Filled.Settings)
}

/**
 * Where a widget tap should land.
 *
 * Widgets deep-link into a specific team or season rather than just opening the
 * app, so the URI carries the selection and the pane state picks it up.
 */
sealed interface DeepLinkTarget {
    data class Owner(val ownerId: String) : DeepLinkTarget
    data class SeasonYear(val year: Int) : DeepLinkTarget
    data object RecordBook : DeepLinkTarget

    companion object {
        const val SCHEME = "leaguehistory"
        const val HOST = "record"

        fun ownerUri(ownerId: String): String = "$SCHEME://$HOST/owner/$ownerId"
        fun seasonUri(year: Int): String = "$SCHEME://$HOST/season/$year"
        fun homeUri(): String = "$SCHEME://$HOST/home"

        /** Returns null for anything that is not one of our own links. */
        fun parse(uriString: String?): DeepLinkTarget? {
            val uri = uriString?.let(Uri::parse) ?: return null
            if (uri.scheme != SCHEME || uri.host != HOST) return null

            val segments = uri.pathSegments
            return when {
                segments.size >= 2 && segments[0] == "owner" ->
                    segments[1].takeIf { it.isNotBlank() }?.let(::Owner)

                segments.size >= 2 && segments[0] == "season" ->
                    segments[1].toIntOrNull()?.let(::SeasonYear)

                else -> RecordBook
            }
        }
    }
}
