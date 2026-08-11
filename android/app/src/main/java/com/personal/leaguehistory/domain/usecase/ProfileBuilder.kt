package com.personal.leaguehistory.domain.usecase

import com.personal.leaguehistory.domain.model.BestSeason
import com.personal.leaguehistory.domain.model.Game
import com.personal.leaguehistory.domain.model.HeadToHeadRecord
import com.personal.leaguehistory.domain.model.HighWeek
import com.personal.leaguehistory.domain.model.League
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.model.Season
import com.personal.leaguehistory.domain.model.SeasonLine

/**
 * Folds the raw league results into one [OwnerProfile] per current owner.
 *
 * This is a direct port of `createProfiles()` in the web record book
 * (index.html), and the two are expected to agree row for row. Two rules from
 * that implementation are load-bearing and easy to lose in translation:
 *
 *  - Only owners present in the `owners` map get a profile. Seasons reference a
 *    couple of departed managers who were never added there, and every one of
 *    their games is skipped rather than attributed to somebody else.
 *  - `excludeFromHome` teams contribute their *games* (head-to-head, high
 *    weeks) but not their *season totals*, which keeps folded franchises out of
 *    the all-time standings.
 */
object ProfileBuilder {

    /** Rounds that count toward a manager's playoff record. */
    private val PLAYOFF_ROUNDS = setOf("Quarterfinal", "Semifinal", "Championship")

    private const val REGULAR_SEASON_LABEL = "Regular Season"

    /**
     * The 2020 season was deleted from the league host before this record book
     * was built; only the championship result survives. It is applied to
     * championship displays alone and never to standings, records or points.
     */
    private const val LOST_SEASON_YEAR = 2020
    private const val LOST_SEASON_CHAMPION = "charlie_vonderheid"

    fun build(league: League): Map<String, OwnerProfile> {
        val accumulators = league.owners.mapValues { (id, owner) -> Accumulator(id, owner.name) }

        league.seasons.sortedBy { it.year }.forEach { season ->
            accumulateSeasonTotals(season, accumulators)
            accumulateGames(season, accumulators)
        }

        return league.owners.mapValues { (id, owner) ->
            val totals = accumulators.getValue(id)
            val championshipYears = totals.championshipYears.toMutableList()

            if (id == LOST_SEASON_CHAMPION && LOST_SEASON_YEAR !in championshipYears) {
                championshipYears.add(0, LOST_SEASON_YEAR)
            }

            OwnerProfile(
                ownerId = id,
                name = owner.name,
                currentTeam = owner.currentTeam,
                icon = owner.icon,
                color = owner.color,
                seasons = totals.seasons.sortedBy { it.year },
                wins = totals.wins,
                losses = totals.losses,
                pointsFor = totals.pointsFor,
                pointsAgainst = totals.pointsAgainst,
                championshipYears = championshipYears,
                lastPlaceYears = totals.lastPlaceYears,
                finishes = totals.finishes,
                highWeek = totals.highWeek,
                bestSeason = totals.bestSeason,
                playoffWins = totals.playoffWins,
                playoffLosses = totals.playoffLosses,
                headToHead = totals.headToHead.mapValues { (_, h2h) -> h2h.toRecord() }
            )
        }
    }

    private fun accumulateSeasonTotals(season: Season, accumulators: Map<String, Accumulator>) {
        season.teams.values.forEach { team ->
            val totals = accumulators[team.ownerId] ?: return@forEach
            if (team.excludeFromHome) return@forEach

            totals.seasons.add(
                SeasonLine(
                    year = season.year,
                    teamName = team.name,
                    wins = team.wins,
                    losses = team.losses,
                    pointsFor = team.pointsFor,
                    pointsAgainst = team.pointsAgainst,
                    finalRank = team.finalRank
                )
            )

            totals.wins += team.wins
            totals.losses += team.losses
            totals.pointsFor += team.pointsFor
            totals.pointsAgainst += team.pointsAgainst
            totals.finishes[season.year] = team.finalRank

            if (team.finalRank == 1) totals.championshipYears.add(season.year)
            if (team.officialLastPlace || team.finalRank == season.teamCount) {
                totals.lastPlaceYears.add(season.year)
            }

            if (totals.bestSeason == null || team.pointsFor > totals.bestSeason!!.points) {
                totals.bestSeason = BestSeason(season.year, team.pointsFor, team.name)
            }
        }
    }

    private fun accumulateGames(season: Season, accumulators: Map<String, Accumulator>) {
        season.regularGames.forEach { game ->
            recordGame(season, game, REGULAR_SEASON_LABEL, accumulators)
        }

        season.postseasonGames.forEach { game ->
            recordGame(season, game, game.label ?: REGULAR_SEASON_LABEL, accumulators)

            if (game.label in PLAYOFF_ROUNDS) {
                val homeOwner = season.teams[game.homeKey]?.ownerId
                val awayOwner = season.teams[game.awayKey]?.ownerId
                val homeWon = game.homeScore > game.awayScore
                val winner = if (homeWon) homeOwner else awayOwner
                val loser = if (homeWon) awayOwner else homeOwner

                accumulators[winner]?.let { it.playoffWins += 1 }
                accumulators[loser]?.let { it.playoffLosses += 1 }
            }
        }
    }

    private fun recordGame(
        season: Season,
        game: Game,
        label: String,
        accumulators: Map<String, Accumulator>
    ) {
        val homeTeam = season.teams[game.homeKey] ?: return
        val awayTeam = season.teams[game.awayKey] ?: return

        addHeadToHead(accumulators, homeTeam.ownerId, awayTeam.ownerId, game.homeScore, game.awayScore)
        addHeadToHead(accumulators, awayTeam.ownerId, homeTeam.ownerId, game.awayScore, game.homeScore)

        listOf(
            Triple(homeTeam, awayTeam.ownerId, game.homeScore),
            Triple(awayTeam, homeTeam.ownerId, game.awayScore)
        ).forEach { (team, opponentId, points) ->
            val totals = accumulators[team.ownerId] ?: return@forEach
            val current = totals.highWeek
            if (current == null || points > current.points) {
                totals.highWeek = HighWeek(
                    year = season.year,
                    week = game.week,
                    points = points,
                    teamName = team.name,
                    opponentId = opponentId,
                    label = label
                )
            }
        }
    }

    private fun addHeadToHead(
        accumulators: Map<String, Accumulator>,
        ownerId: String,
        opponentId: String,
        pointsFor: Double,
        pointsAgainst: Double
    ) {
        // Matches the web build: a matchup is only recorded when both managers
        // are current owners, so departed managers never appear as opponents.
        if (!accumulators.containsKey(ownerId) || !accumulators.containsKey(opponentId)) return

        val row = accumulators.getValue(ownerId).headToHead.getOrPut(opponentId) {
            MutableHeadToHead(opponentId)
        }

        row.games += 1
        row.pointsFor += pointsFor
        row.pointsAgainst += pointsAgainst
        if (pointsFor > pointsAgainst) row.wins += 1 else row.losses += 1
    }

    private class Accumulator(val ownerId: String, val name: String) {
        val seasons = mutableListOf<SeasonLine>()
        var wins = 0
        var losses = 0
        var pointsFor = 0.0
        var pointsAgainst = 0.0
        val championshipYears = mutableListOf<Int>()
        val lastPlaceYears = mutableListOf<Int>()
        val finishes = mutableMapOf<Int, Int>()
        var highWeek: HighWeek? = null
        var bestSeason: BestSeason? = null
        var playoffWins = 0
        var playoffLosses = 0
        val headToHead = mutableMapOf<String, MutableHeadToHead>()
    }

    private class MutableHeadToHead(val opponentId: String) {
        var games = 0
        var wins = 0
        var losses = 0
        var pointsFor = 0.0
        var pointsAgainst = 0.0

        fun toRecord() = HeadToHeadRecord(
            opponentId = opponentId,
            games = games,
            wins = wins,
            losses = losses,
            pointsFor = pointsFor,
            pointsAgainst = pointsAgainst
        )
    }
}
