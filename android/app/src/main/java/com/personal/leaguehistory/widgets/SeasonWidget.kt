package com.personal.leaguehistory.widgets

import android.content.Context
import androidx.compose.runtime.Composable
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
import com.personal.leaguehistory.R

/**
 * Final standings from the most recent season.
 *
 * The header deep-links to that season's page; each row deep-links to the
 * manager's profile.
 */
class SeasonWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val data = WidgetData.latestSeason(context, limit = MAX_ROWS)

        provideContent {
            GlanceTheme(colors = WidgetTheme.colors) {
                SeasonContent(data)
            }
        }
    }

    @Composable
    private fun SeasonContent(data: SeasonWidgetData) {
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
                title = context.getString(R.string.widget_season_heading, data.year?.toString().orEmpty()),
                trailing = null,
                onClick = data.year?.let { seasonIntent(context, it) } ?: homeIntent(context)
            )

            if (data.rows.isEmpty()) {
                WidgetEmptyState(context.getString(R.string.widget_empty))
                return@Column
            }

            val visible = ((size.height.value - 34) / ROW_HEIGHT_DP)
                .toInt()
                .coerceIn(1, data.rows.size)

            data.rows.take(visible).forEachIndexed { index, row ->
                WidgetTeamRow(
                    context = context,
                    rank = index + 1,
                    row = row,
                    // The champion is the point of the widget: make it obvious.
                    highlight = index == 0
                )
            }
        }
    }

    private companion object {
        const val MAX_ROWS = 12
        const val ROW_HEIGHT_DP = 34
    }
}

class SeasonWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SeasonWidget()
}
