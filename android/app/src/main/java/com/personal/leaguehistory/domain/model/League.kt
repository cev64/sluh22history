package com.personal.leaguehistory.domain.model

/** An owner as they exist today, independent of any single season. */
data class Owner(
    val id: String,
    val name: String,
    val currentTeam: String,
    val icon: String,
    val color: Long
)

/** One owner's team for one season. */
data class SeasonTeam(
    val key: String,
    val ownerId: String,
    val name: String,
    val ownerName: String,
    val division: String?,
    val wins: Int,
    val losses: Int,
    val pointsFor: Double,
    val pointsAgainst: Double,
    val divisionRecord: String?,
    val finalRank: Int,
    val icon: String,
    val color: Long,
    /** Set for teams that folded mid-history and should not carry all-time totals. */
    val excludeFromHome: Boolean = false,
    /** Overrides the "worst final rank" heuristic when the league voted otherwise. */
    val officialLastPlace: Boolean = false
) {
    val games: Int get() = wins + losses
    val pointDifferential: Double get() = pointsFor - pointsAgainst
}

data class Game(
    val week: Int?,
    val homeKey: String,
    val awayKey: String,
    val homeScore: Double,
    val awayScore: Double,
    /** Null for regular-season games; the round name for postseason games. */
    val label: String? = null
)

data class Season(
    val year: Int,
    val teams: Map<String, SeasonTeam>,
    val regularGames: List<Game>,
    val postseasonGames: List<Game>
) {
    val teamCount: Int get() = teams.size

    val champion: SeasonTeam? get() = teams.values.firstOrNull { it.finalRank == 1 }

    val lastPlace: SeasonTeam?
        get() = teams.values.firstOrNull { it.officialLastPlace }
            ?: teams.values.firstOrNull { it.finalRank == teamCount }

    val divisions: List<String>
        get() = teams.values.mapNotNull { it.division }.distinct().sorted()
}

data class League(
    val owners: Map<String, Owner>,
    val seasons: List<Season>
) {
    val newestSeason: Season? get() = seasons.maxByOrNull { it.year }
    fun season(year: Int): Season? = seasons.firstOrNull { it.year == year }
}
