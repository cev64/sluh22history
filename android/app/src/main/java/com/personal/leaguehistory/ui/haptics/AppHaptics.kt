package com.personal.leaguehistory.ui.haptics

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import com.personal.leaguehistory.domain.model.HapticStrength

/**
 * Every buzz in the app goes through here.
 *
 * Feedback is expressed as intent ([Feedback]) rather than as a raw constant so
 * one setting can scale the whole app. At [HapticStrength.FULL] ordinary taps
 * buzz too, which is the requested default; [HapticStrength.SUBTLE] keeps only
 * the feedback that marks a real state change, matching the platform's own
 * restraint.
 */
enum class Feedback {
    /** An ordinary button or row press. */
    Tap,

    /** Moving between tabs, sort keys, segmented options. */
    Select,

    /** A switch or a setting flipping. */
    Toggle,

    /** An action completed, e.g. a widget refresh finishing. */
    Confirm,

    /** An action was refused or had no effect. */
    Reject,

    /** A long-press was recognised. */
    LongPress
}

@Immutable
class AppHaptics(
    private val view: View,
    private val strength: HapticStrength
) {
    fun perform(feedback: Feedback) {
        if (strength == HapticStrength.OFF) return
        if (strength == HapticStrength.SUBTLE && feedback in SUPPRESSED_WHEN_SUBTLE) return

        val constant = when (feedback) {
            Feedback.Tap -> HapticFeedbackConstants.VIRTUAL_KEY
            Feedback.Select -> segmentTickOr(HapticFeedbackConstants.CLOCK_TICK)
            Feedback.Toggle -> toggleOr(HapticFeedbackConstants.CONTEXT_CLICK)
            Feedback.Confirm -> HapticFeedbackConstants.CONFIRM
            Feedback.Reject -> HapticFeedbackConstants.REJECT
            Feedback.LongPress -> HapticFeedbackConstants.LONG_PRESS
        }

        // FLAG_IGNORE_VIEW_SETTING is deliberately not used: if the user has
        // turned system haptics off, the app should stay silent.
        view.performHapticFeedback(constant)
    }

    /** SEGMENT_TICK is a crisper detent than CLOCK_TICK, but only exists on 34+. */
    private fun segmentTickOr(fallback: Int): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            HapticFeedbackConstants.SEGMENT_TICK
        } else {
            fallback
        }

    private fun toggleOr(fallback: Int): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            HapticFeedbackConstants.TOGGLE_ON
        } else {
            fallback
        }

    private companion object {
        val SUPPRESSED_WHEN_SUBTLE = setOf(Feedback.Tap, Feedback.Select)
    }
}

val LocalAppHaptics: ProvidableCompositionLocal<AppHaptics?> = staticCompositionLocalOf { null }
