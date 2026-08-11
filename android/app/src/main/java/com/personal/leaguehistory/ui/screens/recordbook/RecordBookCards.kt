package com.personal.leaguehistory.ui.screens.recordbook

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.personal.leaguehistory.R
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.usecase.AllTimeSortKey
import com.personal.leaguehistory.domain.usecase.SortDirection
import com.personal.leaguehistory.domain.usecase.SortState
import com.personal.leaguehistory.ui.components.SectionCard
import com.personal.leaguehistory.ui.components.TeamIdentity
import com.personal.leaguehistory.ui.format.formatDifferential
import com.personal.leaguehistory.ui.format.formatPoints
import com.personal.leaguehistory.ui.format.formatRecord
import com.personal.leaguehistory.ui.format.formatWinPct
import com.personal.leaguehistory.ui.format.repeatGlyph
import com.personal.leaguehistory.ui.haptics.Feedback
import com.personal.leaguehistory.ui.haptics.hapticClick
import com.personal.leaguehistory.ui.haptics.hapticClickable
import com.personal.leaguehistory.ui.theme.LeagueTheme

private const val TROPHY = "🏆"
private const val POOP = "💩"

@Composable
fun ChampionsCard(
    profiles: List<OwnerProfile>,
    selectedOwnerId: String?,
    onSelectOwner: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    SectionCard(
        title = stringResource(R.string.section_champions),
        icon = TROPHY,
        modifier = modifier
    ) {
        profiles.forEachIndexed { index, profile ->
            if (index > 0) RowDivider()
            TitleRow(
                rank = index + 1,
                profile = profile,
                count = profile.titleCount,
                years = profile.championshipYears,
                glyph = TROPHY,
                accent = LeagueTheme.accents.champion,
                accentContainer = LeagueTheme.accents.championContainer,
                onAccentContainer = LeagueTheme.accents.onChampionContainer,
                selected = profile.ownerId == selectedOwnerId,
                onClick = { onSelectOwner(profile.ownerId) }
            )
        }
    }
}

@Composable
fun LosersCard(
    profiles: List<OwnerProfile>,
    selectedOwnerId: String?,
    onSelectOwner: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    SectionCard(
        title = stringResource(R.string.section_losers),
        icon = POOP,
        modifier = modifier
    ) {
        profiles.forEachIndexed { index, profile ->
            if (index > 0) RowDivider()
            TitleRow(
                rank = index + 1,
                profile = profile,
                count = profile.lastPlaceYears.size,
                years = profile.lastPlaceYears,
                glyph = POOP,
                accent = LeagueTheme.accents.loser,
                accentContainer = LeagueTheme.accents.loserContainer,
                onAccentContainer = LeagueTheme.accents.onLoserContainer,
                selected = profile.ownerId == selectedOwnerId,
                onClick = { onSelectOwner(profile.ownerId) }
            )
        }
    }
}

/** One row of the champions/losers leaderboards. */
@Composable
private fun TitleRow(
    rank: Int,
    profile: OwnerProfile,
    count: Int,
    years: List<Int>,
    glyph: String,
    accent: Color,
    accentContainer: Color,
    onAccentContainer: Color,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent
            )
            .hapticClickable(
                feedback = Feedback.Tap,
                onClickLabel = "Open ${profile.currentTeam} history",
                onClick = onClick
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        RankChip(rank)

        TeamIdentity(
            icon = profile.icon,
            teamName = profile.currentTeam,
            ownerName = profile.name,
            teamColor = Color(profile.color),
            modifier = Modifier.weight(1f)
        )

        Column(horizontalAlignment = Alignment.End) {
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(accentContainer)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(text = repeatGlyph(glyph, count, max = 3), style = MaterialTheme.typography.labelMedium)
                Text(
                    text = count.toString(),
                    style = MaterialTheme.typography.labelLarge,
                    color = onAccentContainer
                )
            }

            Text(
                text = years.joinToString(", "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End,
                modifier = Modifier.padding(top = 3.dp)
            )
        }
    }
}

@Composable
private fun RankChip(rank: Int) {
    Box(
        modifier = Modifier
            .size(26.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = rank.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun AllTimeCard(
    profiles: List<OwnerProfile>,
    sort: SortState<AllTimeSortKey>,
    selectedOwnerId: String?,
    onSelectOwner: (String) -> Unit,
    onSortKey: (AllTimeSortKey) -> Unit,
    onDirectionToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    SectionCard(
        title = stringResource(R.string.section_all_time),
        icon = "📊",
        modifier = modifier,
        trailing = {
            SortControl(
                sort = sort,
                onSortKey = onSortKey,
                onDirectionToggle = onDirectionToggle
            )
        }
    ) {
        BoxWithConstraints {
            // Inside a narrow list pane the table collapses to the site's mobile
            // stat strip; a wide pane gets the full column layout.
            val wide = maxWidth >= 560.dp

            Column {
                profiles.forEachIndexed { index, profile ->
                    if (index > 0) RowDivider()
                    AllTimeRow(
                        rank = index + 1,
                        profile = profile,
                        wide = wide,
                        selected = profile.ownerId == selectedOwnerId,
                        onClick = { onSelectOwner(profile.ownerId) }
                    )
                }
            }
        }
    }
}

@Composable
private fun AllTimeRow(
    rank: Int,
    profile: OwnerProfile,
    wide: Boolean,
    selected: Boolean,
    onClick: () -> Unit
) {
    val accents = LeagueTheme.accents

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent
            )
            .hapticClickable(
                feedback = Feedback.Tap,
                onClickLabel = "Open ${profile.currentTeam} history",
                onClick = onClick
            )
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            RankChip(rank)

            TeamIdentity(
                icon = profile.icon,
                teamName = profile.currentTeam,
                ownerName = profile.name,
                teamColor = Color(profile.color),
                modifier = Modifier.weight(1f)
            )

            if (wide) {
                StatColumn(stringResource(R.string.label_record), formatRecord(profile.wins, profile.losses))
                StatColumn(stringResource(R.string.label_pct), formatWinPct(profile.wins, profile.losses))
                StatColumn(stringResource(R.string.label_points_for), formatPoints(profile.pointsFor))
                StatColumn(stringResource(R.string.label_points_against), formatPoints(profile.pointsAgainst))
                StatColumn(
                    label = stringResource(R.string.label_diff),
                    value = formatDifferential(profile.differential),
                    valueColor = if (profile.differential >= 0) accents.positive else accents.negative
                )
            }
        }

        if (!wide) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                MiniStat(stringResource(R.string.label_record), formatRecord(profile.wins, profile.losses), Modifier.weight(1f))
                MiniStat(stringResource(R.string.label_pct), formatWinPct(profile.wins, profile.losses), Modifier.weight(1f))
                MiniStat(stringResource(R.string.label_points_for), formatPoints(profile.pointsFor), Modifier.weight(1f))
                MiniStat(
                    label = stringResource(R.string.label_diff),
                    value = formatDifferential(profile.differential),
                    modifier = Modifier.weight(1f),
                    valueColor = if (profile.differential >= 0) accents.positive else accents.negative
                )
            }
        }
    }
}

@Composable
private fun StatColumn(
    label: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Column(
        modifier = Modifier.width(74.dp),
        horizontalAlignment = Alignment.End
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = valueColor)
    }
}

/** The site's mobile stat chip, used when the pane is too narrow for columns. */
@Composable
private fun MiniStat(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(9.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(vertical = 5.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(text = value, style = MaterialTheme.typography.labelLarge, color = valueColor)
    }
}

/** Sort-key dropdown plus a direction toggle, mirroring the site's mobile controls. */
@Composable
private fun SortControl(
    sort: SortState<AllTimeSortKey>,
    onSortKey: (AllTimeSortKey) -> Unit,
    onDirectionToggle: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Box {
            TextButton(onClick = hapticClick(Feedback.Select) { expanded = true }) {
                Text(sort.key.label, style = MaterialTheme.typography.labelLarge)
            }

            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                AllTimeSortKey.entries.forEach { key ->
                    DropdownMenuItem(
                        text = { Text(key.label) },
                        onClick = hapticClick(Feedback.Select) {
                            expanded = false
                            onSortKey(key)
                        }
                    )
                }
            }
        }

        TextButton(onClick = hapticClick(Feedback.Select, onDirectionToggle)) {
            Text(
                text = if (sort.direction == SortDirection.ASC) "↑" else "↓",
                style = MaterialTheme.typography.titleMedium
            )
        }
    }
}
