package com.personal.leaguehistory.di

import android.content.Context
import com.personal.leaguehistory.data.repository.LeagueRepositoryImpl
import com.personal.leaguehistory.data.repository.SettingsRepositoryImpl
import com.personal.leaguehistory.domain.repository.LeagueRepository
import com.personal.leaguehistory.domain.repository.SettingsRepository

/**
 * Minimal manual dependency graph.
 *
 * The app has exactly two singletons, and Glance widgets need to reach the
 * repository from a broadcast receiver where no ViewModel exists. A full DI
 * framework would be more machinery than this earns; [initialize] is called
 * from [com.personal.leaguehistory.LeagueHistoryApplication], and widget entry
 * points call [ensureInitialized] because a receiver can run before any
 * activity has started.
 */
object ServiceLocator {

    @Volatile private var leagueRepository: LeagueRepository? = null
    @Volatile private var settingsRepository: SettingsRepository? = null

    fun initialize(context: Context) {
        val appContext = context.applicationContext
        synchronized(this) {
            if (leagueRepository == null) leagueRepository = LeagueRepositoryImpl(appContext)
            if (settingsRepository == null) settingsRepository = SettingsRepositoryImpl(appContext)
        }
    }

    fun ensureInitialized(context: Context) {
        if (leagueRepository == null || settingsRepository == null) initialize(context)
    }

    fun leagueRepository(context: Context): LeagueRepository {
        ensureInitialized(context)
        return requireNotNull(leagueRepository)
    }

    fun settingsRepository(context: Context): SettingsRepository {
        ensureInitialized(context)
        return requireNotNull(settingsRepository)
    }
}
