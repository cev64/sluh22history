package com.personal.leaguehistory.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The coloured emoji chip the site uses to identify a team, at a size that
 * still clears Android's 48dp touch-target guidance when it sits in a row.
 */
@Composable
fun TeamBadge(
    icon: String,
    teamColor: Color,
    modifier: Modifier = Modifier,
    size: Int = 38
) {
    Box(
        modifier = modifier
            .size(size.dp)
            .clip(RoundedCornerShape((size * 0.32f).dp))
            .background(teamColor.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = icon,
            fontSize = (size * 0.46f).sp,
            // The emoji is decoration; the team name beside it carries meaning.
            modifier = Modifier.clearAndSetSemantics { }
        )
    }
}

/** Badge plus the team name and owner name, as used in every standings row. */
@Composable
fun TeamIdentity(
    icon: String,
    teamName: String,
    ownerName: String,
    teamColor: Color,
    modifier: Modifier = Modifier,
    badgeSize: Int = 38,
    compact: Boolean = false
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        TeamBadge(icon = icon, teamColor = teamColor, size = badgeSize)

        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = teamName,
                style = if (compact) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = ownerName,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
