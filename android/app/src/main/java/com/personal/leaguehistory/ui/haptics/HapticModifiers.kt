package com.personal.leaguehistory.ui.haptics

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role

/**
 * Resolves the haptics instance for the current composition. Falls back to a
 * view-backed instance so previews and tests never crash on a missing provider.
 */
@Composable
fun rememberHaptics(): AppHaptics {
    val provided = LocalAppHaptics.current
    val view = LocalView.current
    return provided ?: remember(view) { AppHaptics(view, com.personal.leaguehistory.domain.model.HapticStrength.FULL) }
}

/** Fires [feedback] and then runs [onClick]. */
@Composable
fun hapticClick(feedback: Feedback = Feedback.Tap, onClick: () -> Unit): () -> Unit {
    val haptics = rememberHaptics()
    return {
        haptics.perform(feedback)
        onClick()
    }
}

/**
 * A `clickable` that buzzes on press. Use for custom rows and cards that do not
 * already route through one of the wrapped Material components.
 */
fun Modifier.hapticClickable(
    feedback: Feedback = Feedback.Tap,
    enabled: Boolean = true,
    role: Role? = Role.Button,
    onClickLabel: String? = null,
    onClick: () -> Unit
): Modifier = composed {
    val haptics = rememberHaptics()
    val interactionSource = remember { MutableInteractionSource() }

    clickable(
        interactionSource = interactionSource,
        indication = androidx.compose.material3.ripple(),
        enabled = enabled,
        role = role,
        onClickLabel = onClickLabel
    ) {
        haptics.perform(feedback)
        onClick()
    }
}
