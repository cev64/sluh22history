package com.personal.leaguehistory.data.local

import com.personal.leaguehistory.domain.model.Game
import com.personal.leaguehistory.domain.model.League
import com.personal.leaguehistory.domain.model.Owner
import com.personal.leaguehistory.domain.model.Season
import com.personal.leaguehistory.domain.model.SeasonTeam
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * Wire shape of assets/league.json, which is generated from the web record
 * book's LEAGUE_DATA blob by tools/extract-league-data.js. These types exist
 * only to decode that file; the rest of the app works with domain models.
 */

@Serializable
internal data class LeagueDto(
    val owners: Map<String, OwnerDto> = emptyMap(),
    val seasons: List<SeasonDto> = emptyList()
)

@Serializable
internal data class OwnerDto(
    val name: String,
    val currentTeam: String,
    val icon: String = "",
    val color: String = "#5f7086"
)

@Serializable
internal data class SeasonDto(
    val year: Int,
    val teams: Map<String, TeamDto> = emptyMap(),
    val regularGames: List<GameDto> = emptyList(),
    val postseasonGames: List<GameDto> = emptyList()
)

@Serializable
internal data class TeamDto(
    val ownerId: String,
    val name: String,
    val owner: String = "",
    val division: String? = null,
    val wins: Int = 0,
    val losses: Int = 0,
    val pf: Double = 0.0,
    val pa: Double = 0.0,
    val divRecord: String? = null,
    val finalRank: Int = 0,
    val icon: String = "",
    val color: String = "#5f7086",
    val excludeFromHome: Boolean = false,
    val officialLastPlace: Boolean = false
)

@Serializable
internal data class GameDto(
    val week: Int? = null,
    @SerialName("a") val homeKey: String,
    @SerialName("b") val awayKey: String,
    @SerialName("aScore") val homeScore: Double,
    @SerialName("bScore") val awayScore: Double,
    val label: String? = null
)

/** Parses "#rrggbb" into an opaque ARGB value, falling back to the muted grey. */
internal fun String.toArgb(): Long {
    val hex = trim().removePrefix("#")
    val rgb = hex.toLongOrNull(radix = 16) ?: return 0xFF5F7086
    return when (hex.length) {
        6 -> 0xFF000000L or rgb
        8 -> rgb
        else -> 0xFF5F7086
    }
}

internal fun LeagueDto.toDomain(): League = League(
    owners = owners.mapValues { (id, dto) ->
        Owner(
            id = id,
            name = dto.name,
            currentTeam = dto.currentTeam,
            icon = dto.icon,
            color = dto.color.toArgb()
        )
    },
    seasons = seasons.map { it.toDomain() }.sortedBy { it.year }
)

private fun SeasonDto.toDomain(): Season = Season(
    year = year,
    teams = teams.mapValues { (key, dto) ->
        SeasonTeam(
            key = key,
            ownerId = dto.ownerId,
            name = dto.name,
            ownerName = dto.owner,
            division = dto.division,
            wins = dto.wins,
            losses = dto.losses,
            pointsFor = dto.pf,
            pointsAgainst = dto.pa,
            divisionRecord = dto.divRecord,
            finalRank = dto.finalRank,
            icon = dto.icon,
            color = dto.color.toArgb(),
            excludeFromHome = dto.excludeFromHome,
            officialLastPlace = dto.officialLastPlace
        )
    },
    regularGames = regularGames.map { it.toDomain() },
    postseasonGames = postseasonGames.map { it.toDomain() }
)

private fun GameDto.toDomain(): Game = Game(
    week = week,
    homeKey = homeKey,
    awayKey = awayKey,
    homeScore = homeScore,
    awayScore = awayScore,
    label = label
)
