package com.personal.leaguehistory.domain.repository

import com.personal.leaguehistory.domain.model.League
import com.personal.leaguehistory.domain.model.OwnerProfile

/**
 * Read access to the record book.
 *
 * The league's results are historical and ship inside the APK, so every call
 * here is served from local state and works with no network at all. The
 * interface stays suspend-friendly so a future remote sync can slot in behind
 * it without touching callers.
 */
interface LeagueRepository {
    suspend fun league(): League
    suspend fun profiles(): Map<String, OwnerProfile>
    suspend fun profile(ownerId: String): OwnerProfile?
}
