package com.personal.leaguehistory.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.personal.leaguehistory.R

/**
 * Champions widget.
 *
 * Small: the reigning champion alone, which is the one fact worth a glance.
 * Medium and larger: the reigning champion plus the all-time title leaders.
 * Every row deep-links to that manager's profile.
 */
class ChampionsWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(
        setOf(SMALL, MEDIUM, LARGE)
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Data is read before provideContent so the first frame the host sees is
        // already populated rather than an empty shell.
        val leaders = WidgetData.champions(context, limit = 5)

        provideContent {
            GlanceTheme(colors = WidgetTheme.colors) {
                ChampionsContent(leaders)
            }
        }
    }

    @Composable
    private fun ChampionsContent(data: ChampionsWidgetData) {
        val context = LocalContext.current
        val size = LocalSize.current
        val showLeaders = size.height >= MEDIUM.height

        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.background)
                .cornerRadius(24.dp)
                .padding(12.dp)
        ) {
            WidgetHeader(
                title = context.getString(R.string.widget_champions_heading),
                trailing = data.reigningYear?.toString(),
                onClick = homeIntent(context)
            )

            val champion = data.reigningChampion
            if (champion == null) {
                WidgetEmptyState(context.getString(R.string.widget_empty))
                return@Column
            }

            Row(
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .padding(horizontal = 6.dp, vertical = 6.dp)
                    .cornerRadius(16.dp)
                    .background(GlanceTheme.colors.surfaceVariant)
                    .clickable(actionStartActivity(ownerIntent(context, champion.ownerId))),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TeamGlyph(icon = champion.icon, teamColor = champion.teamColor, size = 34)

                Spacer(modifier = GlanceModifier.width(10.dp))

                Column(modifier = GlanceModifier.defaultWeight()) {
                    Text(
                        text = context.getString(R.string.widget_reigning_champion).uppercase(),
                        style = TextStyle(
                            color = GlanceTheme.colors.tertiary,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    )
                    Text(
                        text = champion.teamName,
                        maxLines = 1,
                        style = TextStyle(
                            color = GlanceTheme.colors.onSurface,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    )
                    Text(
                        text = champion.ownerName,
                        maxLines = 1,
                        style = TextStyle(
                            color = GlanceTheme.colors.onSurfaceVariant,
                            fontSize = 11.sp
                        )
                    )
                }
            }

            if (showLeaders && data.leaders.isNotEmpty()) {
                Spacer(modifier = GlanceModifier.height(8.dp))
                WidgetDivider()
                Spacer(modifier = GlanceModifier.height(4.dp))

                // Trim the list to whatever the current widget height can show.
                val visible = ((size.height.value - 150) / 34).toInt().coerceIn(1, data.leaders.size)

                data.leaders.take(visible).forEachIndexed { index, row ->
                    WidgetTeamRow(
                        context = context,
                        rank = index + 1,
                        row = row.copy(
                            primaryStat = "🏆 ${row.primaryStat}",
                            secondaryStat = row.secondaryStat
                        ),
                        highlight = row.ownerId == champion.ownerId
                    )
                }
            }
        }
    }

    private companion object {
        val SMALL = DpSize(140.dp, 110.dp)
        val MEDIUM = DpSize(250.dp, 180.dp)
        val LARGE = DpSize(250.dp, 300.dp)
    }
}

class ChampionsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ChampionsWidget()
}
