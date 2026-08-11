package com.personal.leaguehistory.domain

import com.personal.leaguehistory.domain.model.HeadToHeadRecord
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.usecase.AllTimeSortKey
import com.personal.leaguehistory.domain.usecase.HeadToHeadSortKey
import com.personal.leaguehistory.domain.usecase.SortDirection
import com.personal.leaguehistory.domain.usecase.SortState
import com.personal.leaguehistory.domain.usecase.StandingsSort
import org.junit.Assert.assertEquals
import org.junit.Test

class StandingsSortTest {

    private fun profile(
        id: String,
        team: String = id,
        wins: Int = 0,
        losses: Int = 0,
        pointsFor: Double = 0.0,
        pointsAgainst: Double = 0.0,
        titles: List<Int> = emptyList(),
        lastPlace: List<Int> = emptyList()
    ) = OwnerProfile(
        ownerId = id,
        name = id,
        currentTeam = team,
        icon = "",
        color = 0xFF000000,
        seasons = emptyList(),
        wins = wins,
        losses = losses,
        pointsFor = pointsFor,
        pointsAgainst = pointsAgainst,
        championshipYears = titles,
        lastPlaceYears = lastPlace,
        finishes = emptyMap(),
        highWeek = null,
        bestSeason = null,
        playoffWins = 0,
        playoffLosses = 0,
        headToHead = emptyMap()
    )

    @Test
    fun `descending wins puts the winningest manager first`() {
        val rows = listOf(
            profile("a", wins = 10, losses = 4),
            profile("b", wins = 14, losses = 0),
            profile("c", wins = 2, losses = 12)
        )

        val sorted = StandingsSort.allTime(rows, SortState(AllTimeSortKey.WINS, SortDirection.DESC))

        assertEquals(listOf("b", "a", "c"), sorted.map { it.ownerId })
    }

    @Test
    fun `ties fall back to wins then points for`() {
        // Same differential, so the tie-break decides the order.
        val rows = listOf(
            profile("low", wins = 5, losses = 5, pointsFor = 900.0, pointsAgainst = 800.0),
            profile("high", wins = 9, losses = 1, pointsFor = 1000.0, pointsAgainst = 900.0),
            profile("mid", wins = 5, losses = 5, pointsFor = 950.0, pointsAgainst = 850.0)
        )

        val sorted = StandingsSort.allTime(
            rows,
            SortState(AllTimeSortKey.DIFFERENTIAL, SortDirection.DESC)
        )

        assertEquals(listOf("high", "mid", "low"), sorted.map { it.ownerId })
    }

    @Test
    fun `team sort is case insensitive and ascending by default`() {
        val rows = listOf(
            profile("c", team = "zebra"),
            profile("a", team = "Alpha"),
            profile("b", team = "mango")
        )

        val sorted = StandingsSort.allTime(rows, SortState(AllTimeSortKey.TEAM, SortDirection.ASC))

        assertEquals(listOf("Alpha", "mango", "zebra"), sorted.map { it.currentTeam })
    }

    @Test
    fun `champions rank by title count then most recent title`() {
        val rows = listOf(
            profile("one", titles = listOf(2021)),
            profile("two", titles = listOf(2022, 2024)),
            profile("three", titles = listOf(2025)),
            profile("none")
        )

        val sorted = StandingsSort.champions(rows)

        assertEquals(listOf("two", "three", "one"), sorted.map { it.ownerId })
    }

    @Test
    fun `losers rank the same way as champions`() {
        val rows = listOf(
            profile("one", lastPlace = listOf(2021)),
            profile("two", lastPlace = listOf(2022, 2023)),
            profile("none")
        )

        val sorted = StandingsSort.losers(rows)

        assertEquals(listOf("two", "one"), sorted.map { it.ownerId })
    }

    @Test
    fun `head to head sorts by opponent name using the supplied lookup`() {
        val rows = listOf(
            HeadToHeadRecord("x", games = 2, wins = 1, losses = 1, pointsFor = 10.0, pointsAgainst = 10.0),
            HeadToHeadRecord("y", games = 2, wins = 2, losses = 0, pointsFor = 20.0, pointsAgainst = 5.0)
        )
        val names = mapOf("x" to "Alpha", "y" to "Beta")

        val sorted = StandingsSort.headToHead(
            rows = rows,
            opponentName = { names.getValue(it) },
            state = SortState(HeadToHeadSortKey.OPPONENT, SortDirection.ASC)
        )

        assertEquals(listOf("x", "y"), sorted.map { it.opponentId })
    }

    @Test
    fun `toggling a direction flips it`() {
        assertEquals(SortDirection.DESC, SortDirection.ASC.toggled())
        assertEquals(SortDirection.ASC, SortDirection.DESC.toggled())
    }
}
