package com.personal.leaguehistory.ui

import com.personal.leaguehistory.ui.format.formatAverage
import com.personal.leaguehistory.ui.format.formatDifferential
import com.personal.leaguehistory.ui.format.formatPoints
import com.personal.leaguehistory.ui.format.formatRecord
import com.personal.leaguehistory.ui.format.formatWinPct
import com.personal.leaguehistory.ui.format.ordinal
import com.personal.leaguehistory.ui.format.repeatGlyph
import org.junit.Assert.assertEquals
import org.junit.Test

/** These must match the web record book's output exactly. */
class FormattersTest {

    @Test
    fun `points keep two decimals and thousands separators`() {
        assertEquals("1,821.72", formatPoints(1821.72))
        assertEquals("9,070.40", formatPoints(9070.4))
        assertEquals("0.00", formatPoints(0.0))
    }

    @Test
    fun `win percentage drops the leading zero`() {
        assertEquals(".629", formatWinPct(44, 26))
        assertEquals("1.000", formatWinPct(5, 0))
        assertEquals(".000", formatWinPct(0, 5))
    }

    @Test
    fun `win percentage of an unplayed record is zero rather than a crash`() {
        assertEquals(".000", formatWinPct(0, 0))
    }

    @Test
    fun `differential is always signed`() {
        assertEquals("+680.42", formatDifferential(680.42))
        assertEquals("-40.74", formatDifferential(-40.74))
        assertEquals("+0.00", formatDifferential(0.0))
    }

    @Test
    fun `records use an en dash like the site`() {
        assertEquals("44–26", formatRecord(44, 26))
    }

    @Test
    fun `averages keep one decimal`() {
        assertEquals("129.6", formatAverage(129.577))
    }

    @Test
    fun `ordinals handle the teens correctly`() {
        assertEquals("1st", ordinal(1))
        assertEquals("2nd", ordinal(2))
        assertEquals("3rd", ordinal(3))
        assertEquals("4th", ordinal(4))
        assertEquals("11th", ordinal(11))
        assertEquals("12th", ordinal(12))
        assertEquals("13th", ordinal(13))
        assertEquals("21st", ordinal(21))
    }

    @Test
    fun `glyph repetition is capped so a row cannot overflow`() {
        assertEquals("", repeatGlyph("🏆", 0))
        assertEquals("🏆🏆", repeatGlyph("🏆", 2))
        assertEquals("🏆", repeatGlyph("🏆", 9, max = 3))
    }
}
