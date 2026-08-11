package com.personal.leaguehistory.domain

import com.personal.leaguehistory.data.local.LeagueDto
import com.personal.leaguehistory.data.local.toDomain
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.usecase.ProfileBuilder
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/**
 * Guards the port of the web record book's `createProfiles()`.
 *
 * Expected values were computed independently from assets/league.json using the
 * same rules the site applies, so a divergence here means the app and the
 * website would disagree about league history.
 */
class ProfileBuilderTest {

    private fun profile(id: String): OwnerProfile =
        requireNotNull(profiles[id]) { "No profile for $id" }

    @Test
    fun `every current owner gets a profile`() {
        assertEquals(10, profiles.size)
    }

    @Test
    fun `career totals match the web record book`() {
        val nathan = profile("nathan_rich")
        assertEquals(44, nathan.wins)
        assertEquals(26, nathan.losses)
        assertEquals(5, nathan.seasonCount)
        assertEquals(9070.40, nathan.pointsFor, 0.01)
        assertEquals(8389.98, nathan.pointsAgainst, 0.01)

        val grant = profile("grant_thornberry")
        assertEquals(26, grant.wins)
        assertEquals(44, grant.losses)
        assertEquals(7954.46, grant.pointsFor, 0.01)
    }

    @Test
    fun `championships are attributed to the right managers`() {
        assertEquals(listOf(2021, 2022), profile("niko_nadreau").championshipYears)
        assertEquals(listOf(2024), profile("nathan_rich").championshipYears)
        assertEquals(listOf(2023), profile("matt_windler").championshipYears)
        assertTrue(profile("ted_williams").championshipYears.isEmpty())
    }

    @Test
    fun `the deleted 2020 season still counts toward championships only`() {
        val charlie = profile("charlie_vonderheid")

        assertEquals(listOf(2020, 2025), charlie.championshipYears)
        // 2020's results are gone, so the season must not appear in any total.
        assertEquals(5, charlie.seasonCount)
        assertTrue(charlie.seasons.none { it.year == 2020 })
        assertEquals(33, charlie.wins)
        assertEquals(37, charlie.losses)
    }

    @Test
    fun `last place uses the official override as well as the worst rank`() {
        assertEquals(listOf(2021, 2022), profile("charlie_vonderheid").lastPlaceYears)
        assertEquals(listOf(2023, 2025), profile("grant_thornberry").lastPlaceYears)
        assertEquals(listOf(2024), profile("jp_torack").lastPlaceYears)
    }

    @Test
    fun `playoff records only count bracket rounds`() {
        val nathan = profile("nathan_rich")
        assertEquals(7, nathan.playoffWins)
        assertEquals(4, nathan.playoffLosses)

        val niko = profile("niko_nadreau")
        assertEquals(5, niko.playoffWins)
        assertEquals(1, niko.playoffLosses)
    }

    @Test
    fun `head to head only covers current owners`() {
        val charlie = profile("charlie_vonderheid")

        // Nine opponents: every current owner except themselves. The two
        // departed managers in the 2021 data must not appear.
        assertEquals(9, charlie.headToHead.size)
        assertTrue(charlie.headToHead.keys.none { it == "jack_figge" || it == "stephen_deves" })

        val vsTed = requireNotNull(charlie.headToHead["ted_williams"])
        assertEquals(12, vsTed.games)
        assertEquals(7, vsTed.wins)
        assertEquals(5, vsTed.losses)
        assertEquals(1756.16, vsTed.pointsFor, 0.01)
        assertEquals(1560.52, vsTed.pointsAgainst, 0.01)
    }

    @Test
    fun `head to head is symmetric between two managers`() {
        val charlie = profile("charlie_vonderheid")
        val ted = profile("ted_williams")

        val forward = requireNotNull(charlie.headToHead["ted_williams"])
        val reverse = requireNotNull(ted.headToHead["charlie_vonderheid"])

        assertEquals(forward.games, reverse.games)
        assertEquals(forward.wins, reverse.losses)
        assertEquals(forward.pointsFor, reverse.pointsAgainst, 0.001)
    }

    @Test
    fun `highest week considers playoff games too`() {
        val highWeek = requireNotNull(profile("charlie_vonderheid").highWeek)

        assertEquals(2023, highWeek.year)
        assertEquals(195.10, highWeek.points, 0.01)
        assertEquals("Semifinal", highWeek.label)
    }

    @Test
    fun `season lines are ordered oldest first`() {
        val years = profile("nathan_rich").seasons.map { it.year }
        assertEquals(years.sorted(), years)
        assertEquals(listOf(2021, 2022, 2023, 2024, 2025), years)
    }

    @Test
    fun `derived rates agree with the underlying totals`() {
        val ted = profile("ted_williams")

        assertEquals(70, ted.games)
        assertEquals(39.0 / 70.0, ted.winPct, 0.0001)
        assertEquals(ted.pointsFor / 70.0, ted.pointsPerGame, 0.0001)
        assertEquals(ted.pointsFor - ted.pointsAgainst, ted.differential, 0.0001)
    }

    @Test
    fun `best and worst finishes come from actual seasons`() {
        val niko = profile("niko_nadreau")
        assertNotNull(niko.bestFinish)
        assertEquals(1, niko.bestFinish)
        assertTrue(niko.yearsFinishing(1).containsAll(listOf(2021, 2022)))
    }

    companion object {
        private lateinit var profiles: Map<String, OwnerProfile>

        @BeforeClass
        @JvmStatic
        fun loadLeague() {
            // Read the same asset the app ships, so the test fails if the
            // extraction script ever writes something unexpected.
            val assetFile = File("src/main/assets/league.json")
            require(assetFile.exists()) { "league.json missing at ${assetFile.absolutePath}" }

            val json = Json { ignoreUnknownKeys = true; isLenient = true }
            val league = json.decodeFromString<LeagueDto>(assetFile.readText()).toDomain()
            profiles = ProfileBuilder.build(league)
        }
    }
}
