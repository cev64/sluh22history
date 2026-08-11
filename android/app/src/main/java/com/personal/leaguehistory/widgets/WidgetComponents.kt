package com.personal.leaguehistory.widgets

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.layout.wrapContentHeight
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.core.net.toUri
import com.personal.leaguehistory.MainActivity
import com.personal.leaguehistory.ui.navigation.DeepLinkTarget

/**
 * Building blocks shared by the three widgets, so they read as one family on
 * the home screen.
 */

/** Opens the app on a specific team's profile. */
internal fun ownerIntent(context: Context, ownerId: String): Intent =
    Intent(Intent.ACTION_VIEW, DeepLinkTarget.ownerUri(ownerId).toUri(), context, MainActivity::class.java)

internal fun seasonIntent(context: Context, year: Int): Intent =
    Intent(Intent.ACTION_VIEW, DeepLinkTarget.seasonUri(year).toUri(), context, MainActivity::class.java)

internal fun homeIntent(context: Context): Intent =
    Intent(Intent.ACTION_VIEW, DeepLinkTarget.homeUri().toUri(), context, MainActivity::class.java)

@Composable
internal fun WidgetHeader(
    title: String,
    trailing: String? = null,
    onClick: Intent? = null
) {
    val modifier = GlanceModifier
        .fillMaxWidth()
        .padding(start = 4.dp, end = 4.dp, bottom = 6.dp)
        .let { if (onClick != null) it.clickable(actionStartActivity(onClick)) else it }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            style = TextStyle(
                color = GlanceTheme.colors.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            ),
            modifier = GlanceModifier.defaultWeight()
        )

        if (trailing != null) {
            Text(
                text = trailing,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            )
        }
    }
}

/**
 * One standings line: rank, emoji badge, team, and a stat pair on the right.
 * The whole row is tappable and deep-links to that team.
 */
@Composable
internal fun WidgetTeamRow(
    context: Context,
    rank: Int,
    row: WidgetRow,
    highlight: Boolean = false
) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 5.dp)
            .cornerRadius(12.dp)
            .then(
                if (highlight) {
                    GlanceModifier.background(GlanceTheme.colors.surfaceVariant)
                } else {
                    GlanceModifier
                }
            )
            .clickable(actionStartActivity(ownerIntent(context, row.ownerId))),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = rank.toString(),
            style = TextStyle(
                color = GlanceTheme.colors.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            ),
            modifier = GlanceModifier.width(18.dp)
        )

        TeamGlyph(icon = row.icon, teamColor = row.teamColor)

        Spacer(modifier = GlanceModifier.width(8.dp))

        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = row.teamName,
                maxLines = 1,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
            )
        }

        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = row.primaryStat,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
            )
            Text(
                text = row.secondaryStat,
                maxLines = 1,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 10.sp
                )
            )
        }
    }
}

/** The coloured emoji chip, matching the app's TeamBadge. */
@Composable
internal fun TeamGlyph(icon: String, teamColor: Long, size: Int = 26) {
    Column(
        modifier = GlanceModifier
            .size(size.dp)
            .cornerRadius((size * 0.33f).dp)
            .background(ColorProvider(Color(teamColor).copy(alpha = 0.18f))),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = icon,
            style = TextStyle(fontSize = (size * 0.42f).sp)
        )
    }
}

@Composable
internal fun WidgetEmptyState(message: String) {
    Column(
        modifier = GlanceModifier.fillMaxWidth().wrapContentHeight().padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = message,
            style = TextStyle(
                color = GlanceTheme.colors.onSurfaceVariant,
                fontSize = 12.sp
            )
        )
    }
}

@Composable
internal fun WidgetDivider() {
    Spacer(
        modifier = GlanceModifier
            .fillMaxWidth()
            .height(1.dp)
            .background(GlanceTheme.colors.outline)
    )
}
