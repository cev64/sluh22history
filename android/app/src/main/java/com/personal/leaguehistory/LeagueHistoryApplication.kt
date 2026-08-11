package com.personal.leaguehistory

import android.app.Application
import com.personal.leaguehistory.di.ServiceLocator

class LeagueHistoryApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.initialize(this)
    }
}
