package com.personal.leaguehistory.data.repository

import android.content.Context
import com.personal.leaguehistory.data.local.LeagueDto
import com.personal.leaguehistory.data.local.toDomain
import com.personal.leaguehistory.domain.model.League
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.repository.LeagueRepository
import com.personal.leaguehistory.domain.usecase.ProfileBuilder
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * Loads the bundled record book once and keeps it in memory.
 *
 * The dataset is a few hundred kilobytes of static history, so parsing it once
 * per process is cheaper and simpler than putting it behind Room. If the app
 * ever starts ingesting live results, this is the seam where a Room-backed
 * cache would replace the asset read.
 */
class LeagueRepositoryImpl(
    private val context: Context,
    private val assetName: String = "league.json",
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : LeagueRepository {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val mutex = Mutex()
    @Volatile private var cachedLeague: League? = null
    @Volatile private var cachedProfiles: Map<String, OwnerProfile>? = null

    override suspend fun league(): League = load().first

    override suspend fun profiles(): Map<String, OwnerProfile> = load().second

    override suspend fun profile(ownerId: String): OwnerProfile? = profiles()[ownerId]

    private suspend fun load(): Pair<League, Map<String, OwnerProfile>> {
        cachedLeague?.let { league ->
            cachedProfiles?.let { profiles -> return league to profiles }
        }

        return mutex.withLock {
            cachedLeague?.let { league ->
                cachedProfiles?.let { profiles -> return@withLock league to profiles }
            }

            withContext(ioDispatcher) {
                val raw = context.assets.open(assetName).use { it.readBytes().decodeToString() }
                val league = json.decodeFromString<LeagueDto>(raw).toDomain()
                val profiles = ProfileBuilder.build(league)

                cachedLeague = league
                cachedProfiles = profiles
                league to profiles
            }
        }
    }
}
