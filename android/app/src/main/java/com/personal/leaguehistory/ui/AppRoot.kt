package com.personal.leaguehistory.ui

import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.personal.leaguehistory.ui.haptics.Feedback
import com.personal.leaguehistory.ui.haptics.rememberHaptics
import com.personal.leaguehistory.ui.navigation.DeepLinkTarget
import com.personal.leaguehistory.ui.navigation.TopLevelDestination
import com.personal.leaguehistory.ui.screens.recordbook.RecordBookScreen
import com.personal.leaguehistory.ui.screens.seasons.SeasonsScreen
import com.personal.leaguehistory.ui.screens.settings.SettingsScreen

/**
 * Chooses the navigation container for the current window size: a bottom bar on
 * the cover screen, a navigation rail once the inner display is open. The
 * selection lives in [rememberSaveable] so folding never resets it.
 */
@Composable
fun AppRoot(deepLink: String? = null) {
    var selectedDestination by rememberSaveable { mutableStateOf(TopLevelDestination.RECORD_BOOK) }

    // Selections live here rather than inside each screen so a widget can drive
    // them and so they survive a fold without a round trip through navigation.
    var selectedOwnerId by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedYear by rememberSaveable { mutableStateOf<Int?>(null) }

    // Only apply an incoming link once; re-applying on every recomposition would
    // fight the user's own taps.
    val consumedLink = remember { mutableStateOf<String?>(null) }

    LaunchedEffect(deepLink) {
        if (deepLink == null || consumedLink.value == deepLink) return@LaunchedEffect
        consumedLink.value = deepLink

        when (val target = DeepLinkTarget.parse(deepLink)) {
            is DeepLinkTarget.Owner -> {
                selectedOwnerId = target.ownerId
                selectedDestination = TopLevelDestination.RECORD_BOOK
            }

            is DeepLinkTarget.SeasonYear -> {
                selectedYear = target.year
                selectedDestination = TopLevelDestination.SEASONS
            }

            DeepLinkTarget.RecordBook -> selectedDestination = TopLevelDestination.RECORD_BOOK
            null -> Unit
        }
    }

    val haptics = rememberHaptics()

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            // This scope is not composable, so string lookups happen inside the
            // icon/label slots rather than out here.
            TopLevelDestination.entries.forEach { destination ->
                item(
                    selected = destination == selectedDestination,
                    onClick = {
                        if (destination != selectedDestination) {
                            haptics.perform(Feedback.Select)
                            selectedDestination = destination
                        }
                    },
                    icon = {
                        Icon(
                            imageVector = destination.icon,
                            contentDescription = stringResource(destination.labelRes)
                        )
                    },
                    label = { Text(stringResource(destination.labelRes)) }
                )
            }
        }
    ) {
        when (selectedDestination) {
            TopLevelDestination.RECORD_BOOK -> RecordBookScreen(
                selectedOwnerId = selectedOwnerId,
                onSelectOwner = { selectedOwnerId = it }
            )

            TopLevelDestination.SEASONS -> SeasonsScreen(
                selectedYear = selectedYear,
                onSelectYear = { selectedYear = it },
                onSelectOwner = { ownerId ->
                    selectedOwnerId = ownerId
                    selectedDestination = TopLevelDestination.RECORD_BOOK
                }
            )

            TopLevelDestination.SETTINGS -> SettingsScreen()
        }
    }
}
