package com.personal.leaguehistory.domain.model

/** One owner's record against one opponent, across every season they overlapped. */
data class HeadToHeadRecord(
    val opponentId: String,
    val games: Int,
    val wins: Int,
    val losses: Int,
    val pointsFor: Double,
    val pointsAgainst: Double
) {
    val differential: Double get() = pointsFor - pointsAgainst
    val winPct: Double get() = if (games > 0) wins.toDouble() / games else 0.0
}

/** A single season line inside an owner's career table. */
data class SeasonLine(
    val year: Int,
    val teamName: String,
    val wins: Int,
    val losses: Int,
    val pointsFor: Double,
    val pointsAgainst: Double,
    val finalRank: Int
)

/** The owner's single highest-scoring week in league history. */
data class HighWeek(
    val year: Int,
    val week: Int?,
    val points: Double,
    val teamName: String,
    val opponentId: String,
    val label: String
)

data class BestSeason(
    val year: Int,
    val points: Double,
    val teamName: String
)

/**
 * Everything the record book knows about one owner, aggregated across seasons.
 * Built once by [com.personal.leaguehistory.domain.usecase.ProfileBuilder].
 */
data class OwnerProfile(
    val ownerId: String,
    val name: String,
    val currentTeam: String,
    val icon: String,
    val color: Long,
    val seasons: List<SeasonLine>,
    val wins: Int,
    val losses: Int,
    val pointsFor: Double,
    val pointsAgainst: Double,
    val championshipYears: List<Int>,
    val lastPlaceYears: List<Int>,
    val finishes: Map<Int, Int>,
    val highWeek: HighWeek?,
    val bestSeason: BestSeason?,
    val playoffWins: Int,
    val playoffLosses: Int,
    val headToHead: Map<String, HeadToHeadRecord>
) {
    val games: Int get() = wins + losses
    val differential: Double get() = pointsFor - pointsAgainst
    val winPct: Double get() = if (games > 0) wins.toDouble() / games else 0.0
    val pointsPerGame: Double get() = if (games > 0) pointsFor / games else 0.0
    val titleCount: Int get() = championshipYears.size
    val seasonCount: Int get() = seasons.size

    /** Best (numerically lowest) finish; null when the owner never played a season. */
    val bestFinish: Int? get() = finishes.values.minOrNull()
    val worstFinish: Int? get() = finishes.values.maxOrNull()

    fun yearsFinishing(rank: Int): List<Int> =
        seasons.filter { it.finalRank == rank }.map { it.year }
}
