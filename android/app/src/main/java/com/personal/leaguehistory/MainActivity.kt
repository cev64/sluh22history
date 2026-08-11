package com.personal.leaguehistory

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import com.personal.leaguehistory.ui.AppRoot
import com.personal.leaguehistory.ui.haptics.AppHaptics
import com.personal.leaguehistory.ui.haptics.LocalAppHaptics
import com.personal.leaguehistory.ui.theme.LeagueHistoryTheme

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels { MainViewModel.Factory }

    /**
     * The activity is `singleTask`, so tapping a widget while the app is already
     * open delivers a new intent instead of recreating the activity. Holding the
     * link in state lets the composition react to both paths.
     */
    private val deepLink = mutableStateOf<String?>(null)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLink.value = intent.data?.toString()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        deepLink.value = intent?.data?.toString()

        // Hold the splash only until the theme preference is known, so the app
        // never flashes the wrong colour scheme on launch.
        splashScreen.setKeepOnScreenCondition { !viewModel.isReady }

        enableEdgeToEdge()

        setContent {
            val settings by viewModel.settings.collectAsStateWithLifecycle()
            val view = LocalView.current
            val haptics = remember(view, settings.hapticStrength) {
                AppHaptics(view, settings.hapticStrength)
            }

            LeagueHistoryTheme(
                themeMode = settings.themeMode,
                useDynamicColor = settings.useDynamicColor
            ) {
                CompositionLocalProvider(LocalAppHaptics provides haptics) {
                    AppRoot(deepLink = deepLink.value)
                }
            }
        }
    }
}
