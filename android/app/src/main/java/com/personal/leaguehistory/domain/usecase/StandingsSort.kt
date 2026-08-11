package com.personal.leaguehistory.domain.usecase

import com.personal.leaguehistory.domain.model.HeadToHeadRecord
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.model.SeasonTeam

enum class SortDirection { ASC, DESC;
    fun toggled(): SortDirection = if (this == ASC) DESC else ASC
}

/** Columns of the all-time standings table, with the site's default direction. */
enum class AllTimeSortKey(val label: String, val defaultDirection: SortDirection) {
    TEAM("Team", SortDirection.ASC),
    SEASONS("Seasons", SortDirection.DESC),
    WINS("Wins", SortDirection.DESC),
    LOSSES("Losses", SortDirection.ASC),
    PCT("PCT", SortDirection.DESC),
    POINTS_FOR("PF", SortDirection.DESC),
    POINTS_AGAINST("PA", SortDirection.ASC),
    DIFFERENTIAL("Diff", SortDirection.DESC),
    POINTS_PER_GAME("PF/G", SortDirection.DESC),
    TITLES("Titles", SortDirection.DESC)
}

enum class HeadToHeadSortKey(val label: String, val defaultDirection: SortDirection) {
    OPPONENT("Opponent", SortDirection.ASC),
    GAMES("Games", SortDirection.DESC),
    WINS("Record", SortDirection.DESC),
    LOSSES("Losses", SortDirection.ASC),
    PCT("PCT", SortDirection.DESC),
    POINTS_FOR("PF", SortDirection.DESC),
    POINTS_AGAINST("PA", SortDirection.ASC),
    DIFFERENTIAL("Diff", SortDirection.DESC)
}

enum class SeasonSortKey(val label: String, val defaultDirection: SortDirection) {
    PLACE("Place", SortDirection.ASC),
    TEAM("Team", SortDirection.ASC),
    RECORD("Record", SortDirection.DESC),
    POINTS_FOR("PF", SortDirection.DESC),
    POINTS_AGAINST("PA", SortDirection.ASC),
    POINTS_PER_GAME("PF/G", SortDirection.DESC),
    DIFFERENTIAL("Diff", SortDirection.DESC)
}

data class SortState<T>(val key: T, val direction: SortDirection)

/**
 * Sorting helpers shared by the screens and the widgets.
 *
 * Ties fall back to wins, then points for, exactly as the web build does, so a
 * column with repeated values still produces a stable, sensible order.
 */
object StandingsSort {

    fun allTime(
        profiles: List<OwnerProfile>,
        state: SortState<AllTimeSortKey>
    ): List<OwnerProfile> {
        val comparator = Comparator<OwnerProfile> { a, b ->
            val primary = when (state.key) {
                AllTimeSortKey.TEAM -> a.currentTeam.lowercase().compareTo(b.currentTeam.lowercase())
                AllTimeSortKey.SEASONS -> a.seasonCount.compareTo(b.seasonCount)
                AllTimeSortKey.WINS -> a.wins.compareTo(b.wins)
                AllTimeSortKey.LOSSES -> a.losses.compareTo(b.losses)
                AllTimeSortKey.PCT -> a.winPct.compareTo(b.winPct)
                AllTimeSortKey.POINTS_FOR -> a.pointsFor.compareTo(b.pointsFor)
                AllTimeSortKey.POINTS_AGAINST -> a.pointsAgainst.compareTo(b.pointsAgainst)
                AllTimeSortKey.DIFFERENTIAL -> a.differential.compareTo(b.differential)
                AllTimeSortKey.POINTS_PER_GAME -> a.pointsPerGame.compareTo(b.pointsPerGame)
                AllTimeSortKey.TITLES -> a.titleCount.compareTo(b.titleCount)
            }

            if (primary != 0) {
                if (state.direction == SortDirection.ASC) primary else -primary
            } else {
                tieBreak(a, b)
            }
        }

        return profiles.sortedWith(comparator)
    }

    fun headToHead(
        rows: List<HeadToHeadRecord>,
        opponentName: (String) -> String,
        state: SortState<HeadToHeadSortKey>
    ): List<HeadToHeadRecord> {
        val comparator = Comparator<HeadToHeadRecord> { a, b ->
            val primary = when (state.key) {
                HeadToHeadSortKey.OPPONENT ->
                    opponentName(a.opponentId).lowercase().compareTo(opponentName(b.opponentId).lowercase())
                HeadToHeadSortKey.GAMES -> a.games.compareTo(b.games)
                HeadToHeadSortKey.WINS -> a.wins.compareTo(b.wins)
                HeadToHeadSortKey.LOSSES -> a.losses.compareTo(b.losses)
                HeadToHeadSortKey.PCT -> a.winPct.compareTo(b.winPct)
                HeadToHeadSortKey.POINTS_FOR -> a.pointsFor.compareTo(b.pointsFor)
                HeadToHeadSortKey.POINTS_AGAINST -> a.pointsAgainst.compareTo(b.pointsAgainst)
                HeadToHeadSortKey.DIFFERENTIAL -> a.differential.compareTo(b.differential)
            }

            if (primary != 0) {
                if (state.direction == SortDirection.ASC) primary else -primary
            } else {
                val byWins = b.wins.compareTo(a.wins)
                if (byWins != 0) byWins else b.pointsFor.compareTo(a.pointsFor)
            }
        }

        return rows.sortedWith(comparator)
    }

    fun season(
        teams: List<SeasonTeam>,
        state: SortState<SeasonSortKey>
    ): List<SeasonTeam> {
        val comparator = Comparator<SeasonTeam> { a, b ->
            val primary = when (state.key) {
                SeasonSortKey.PLACE -> a.finalRank.compareTo(b.finalRank)
                SeasonSortKey.TEAM -> a.name.lowercase().compareTo(b.name.lowercase())
                SeasonSortKey.RECORD -> a.wins.compareTo(b.wins)
                SeasonSortKey.POINTS_FOR -> a.pointsFor.compareTo(b.pointsFor)
                SeasonSortKey.POINTS_AGAINST -> a.pointsAgainst.compareTo(b.pointsAgainst)
                SeasonSortKey.POINTS_PER_GAME -> pointsPerGame(a).compareTo(pointsPerGame(b))
                SeasonSortKey.DIFFERENTIAL -> a.pointDifferential.compareTo(b.pointDifferential)
            }

            if (primary != 0) {
                if (state.direction == SortDirection.ASC) primary else -primary
            } else {
                val byWins = b.wins.compareTo(a.wins)
                if (byWins != 0) byWins else b.pointsFor.compareTo(a.pointsFor)
            }
        }

        return teams.sortedWith(comparator)
    }

    private fun pointsPerGame(team: SeasonTeam): Double =
        if (team.games > 0) team.pointsFor / team.games else 0.0

    private fun tieBreak(a: OwnerProfile, b: OwnerProfile): Int {
        val byWins = b.wins.compareTo(a.wins)
        return if (byWins != 0) byWins else b.pointsFor.compareTo(a.pointsFor)
    }

    /** Title leaders, most championships first, then most recent title. */
    fun champions(profiles: Collection<OwnerProfile>): List<OwnerProfile> =
        profiles.filter { it.championshipYears.isNotEmpty() }
            .sortedWith(
                compareByDescending<OwnerProfile> { it.titleCount }
                    .thenByDescending { it.championshipYears.maxOrNull() ?: 0 }
            )

    /** Last-place leaders, same ordering rules as [champions]. */
    fun losers(profiles: Collection<OwnerProfile>): List<OwnerProfile> =
        profiles.filter { it.lastPlaceYears.isNotEmpty() }
            .sortedWith(
                compareByDescending<OwnerProfile> { it.lastPlaceYears.size }
                    .thenByDescending { it.lastPlaceYears.maxOrNull() ?: 0 }
            )
}
