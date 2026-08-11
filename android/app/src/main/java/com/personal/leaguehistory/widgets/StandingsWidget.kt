package com.personal.leaguehistory.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import com.personal.leaguehistory.R

/**
 * All-time standings widget, ordered by career wins.
 *
 * This is the resizable one: it shows as many managers as the current widget
 * height allows, so the same widget works as a three-row strip on the cover
 * screen and a full ten-row table on the inner display.
 */
class StandingsWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetData.standings(context, limit = MAX_ROWS)

        provideContent {
            GlanceTheme(colors = WidgetTheme.colors) {
                StandingsContent(data)
            }
        }
    }

    @Composable
    private fun StandingsContent(data: StandingsWidgetData) {
        val context = LocalContext.current
        val size = LocalSize.current

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.background)
                .cornerRadius(24.dp)
                .padding(12.dp)
        ) {
            WidgetHeader(
                title = context.getString(R.string.widget_standings_heading),
                trailing = if (data.seasonCount > 0) {
                    context.getString(R.string.widget_seasons_count, data.seasonCount)
                } else {
                    null
                },
                onClick = homeIntent(context)
            )

            if (data.rows.isEmpty()) {
                WidgetEmptyState(context.getString(R.string.widget_empty))
                return@Column
            }

            // Header takes roughly 26dp; each row draws at about 34dp.
            val visible = ((size.height.value - 34) / ROW_HEIGHT_DP)
                .toInt()
                .coerceIn(1, data.rows.size)

            data.rows.take(visible).forEachIndexed { index, row ->
                WidgetTeamRow(context = context, rank = index + 1, row = row)
            }
        }
    }

    private companion object {
        const val MAX_ROWS = 12
        const val ROW_HEIGHT_DP = 34
    }
}

class StandingsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = StandingsWidget()
}
