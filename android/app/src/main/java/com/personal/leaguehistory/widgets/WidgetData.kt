package com.personal.leaguehistory.widgets

import android.content.Context
import com.personal.leaguehistory.di.ServiceLocator
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.usecase.AllTimeSortKey
import com.personal.leaguehistory.domain.usecase.SortState
import com.personal.leaguehistory.domain.usecase.StandingsSort

/** A single widget row, flattened so the Glance layer does no computation. */
internal data class WidgetRow(
    val ownerId: String,
    val icon: String,
    val teamName: String,
    val ownerName: String,
    val teamColor: Long,
    val primaryStat: String,
    val secondaryStat: String
)

internal data class ChampionsWidgetData(
    val reigningChampion: WidgetRow?,
    val reigningYear: Int?,
    val leaders: List<WidgetRow>
)

internal data class StandingsWidgetData(
    val rows: List<WidgetRow>,
    val seasonCount: Int
)

internal data class SeasonWidgetData(
    val year: Int?,
    val rows: List<WidgetRow>
)

/**
 * Reads the bundled record book for the widgets.
 *
 * The repository caches after the first parse, so repeated widget updates in
 * the same process are cheap. Every function returns empty data rather than
 * throwing, because a crash inside `provideGlance` leaves the host showing an
 * error tile until the next update.
 */
internal object WidgetData {

    suspend fun champions(context: Context, limit: Int): ChampionsWidgetData = runCatching {
        val repository = ServiceLocator.leagueRepository(context)
        val league = repository.league()
        val profiles = repository.profiles()

        val newest = league.newestSeason
        val championTeam = newest?.champion
        val championProfile = championTeam?.let { profiles[it.ownerId] }

        ChampionsWidgetData(
            reigningChampion = championProfile?.let { profile ->
                WidgetRow(
                    ownerId = profile.ownerId,
                    icon = profile.icon,
                    teamName = championTeam.name,
                    ownerName = profile.name,
                    teamColor = profile.color,
                    primaryStat = "${profile.titleCount}",
                    secondaryStat = profile.championshipYears.joinToString(", ")
                )
            },
            reigningYear = newest?.year,
            leaders = StandingsSort.champions(profiles.values)
                .take(limit)
                .map { profile ->
                    WidgetRow(
                        ownerId = profile.ownerId,
                        icon = profile.icon,
                        teamName = profile.currentTeam,
                        ownerName = profile.name,
                        teamColor = profile.color,
                        primaryStat = profile.titleCount.toString(),
                        secondaryStat = profile.championshipYears.joinToString(", ")
                    )
                }
        )
    }.getOrElse { ChampionsWidgetData(null, null, emptyList()) }

    suspend fun standings(context: Context, limit: Int): StandingsWidgetData = runCatching {
        val repository = ServiceLocator.leagueRepository(context)
        val league = repository.league()
        val profiles = repository.profiles()

        val sorted = StandingsSort.allTime(
            profiles.values.toList(),
            SortState(AllTimeSortKey.WINS, AllTimeSortKey.WINS.defaultDirection)
        )

        StandingsWidgetData(
            rows = sorted.take(limit).map { it.toRow() },
            seasonCount = league.seasons.size
        )
    }.getOrElse { StandingsWidgetData(emptyList(), 0) }

    suspend fun latestSeason(context: Context, limit: Int): SeasonWidgetData = runCatching {
        val repository = ServiceLocator.leagueRepository(context)
        val season = repository.league().newestSeason
            ?: return@runCatching SeasonWidgetData(null, emptyList())

        SeasonWidgetData(
            year = season.year,
            rows = season.teams.values
                .sortedBy { it.finalRank }
                .take(limit)
                .map { team ->
                    WidgetRow(
                        ownerId = team.ownerId,
                        icon = team.icon,
                        teamName = team.name,
                        ownerName = team.ownerName,
                        teamColor = team.color,
                        primaryStat = "${team.wins}–${team.losses}",
                        secondaryStat = ordinalShort(team.finalRank)
                    )
                }
        )
    }.getOrElse { SeasonWidgetData(null, emptyList()) }

    private fun OwnerProfile.toRow(): WidgetRow = WidgetRow(
        ownerId = ownerId,
        icon = icon,
        teamName = currentTeam,
        ownerName = name,
        teamColor = color,
        primaryStat = "$wins–$losses",
        secondaryStat = com.personal.leaguehistory.ui.format.formatWinPct(wins, losses)
    )

    private fun ordinalShort(value: Int): String = when {
        value % 100 in 11..13 -> "${value}th"
        value % 10 == 1 -> "${value}st"
        value % 10 == 2 -> "${value}nd"
        value % 10 == 3 -> "${value}rd"
        else -> "${value}th"
    }
}
