package com.personal.leaguehistory.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.personal.leaguehistory.R
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.usecase.HeadToHeadSortKey
import com.personal.leaguehistory.domain.usecase.SortDirection
import com.personal.leaguehistory.domain.usecase.SortState
import com.personal.leaguehistory.domain.usecase.StandingsSort
import com.personal.leaguehistory.ui.components.SectionCard
import com.personal.leaguehistory.ui.components.TeamBadge
import com.personal.leaguehistory.ui.components.TeamIdentity
import com.personal.leaguehistory.ui.format.formatAverage
import com.personal.leaguehistory.ui.format.formatDifferential
import com.personal.leaguehistory.ui.format.formatPoints
import com.personal.leaguehistory.ui.format.formatRecord
import com.personal.leaguehistory.ui.format.formatWinPct
import com.personal.leaguehistory.ui.format.ordinal
import com.personal.leaguehistory.ui.format.repeatGlyph
import com.personal.leaguehistory.ui.haptics.Feedback
import com.personal.leaguehistory.ui.haptics.hapticClick
import com.personal.leaguehistory.ui.haptics.hapticClickable
import com.personal.leaguehistory.ui.theme.EyebrowStyle
import com.personal.leaguehistory.ui.theme.LeagueTheme

@Composable
fun ProfilePane(
    profile: OwnerProfile?,
    profilesById: Map<String, OwnerProfile>,
    headToHeadSort: SortState<HeadToHeadSortKey>,
    onHeadToHeadSort: (HeadToHeadSortKey) -> Unit,
    onHeadToHeadDirectionToggle: () -> Unit,
    onSelectOpponent: (String) -> Unit,
    onClose: (() -> Unit)?
) {
    if (profile == null) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = stringResource(R.string.profile_empty),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        return
    }

    val safeInsets = WindowInsets.safeDrawing.asPaddingValues()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(
            top = safeInsets.calculateTopPadding(),
            bottom = safeInsets.calculateBottomPadding() + 24.dp
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item(key = "header") {
            ProfileHeader(profile = profile, onClose = onClose)
        }

        item(key = "achievements") {
            AchievementRow(
                profile = profile,
                profilesById = profilesById,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }

        item(key = "seasons") {
            SeasonHistoryCard(
                profile = profile,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }

        item(key = "chart") {
            SectionCard(
                title = stringResource(R.string.profile_wins_by_year),
                icon = "📈",
                modifier = Modifier.padding(horizontal = 12.dp)
            ) {
                WinsByYearChart(
                    seasons = profile.seasons,
                    lineColor = Color(profile.color),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
        }

        item(key = "h2h") {
            HeadToHeadCard(
                profile = profile,
                profilesById = profilesById,
                sort = headToHeadSort,
                onSortKey = onHeadToHeadSort,
                onDirectionToggle = onHeadToHeadDirectionToggle,
                onSelectOpponent = onSelectOpponent,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }
    }
}

@Composable
private fun ProfileHeader(profile: OwnerProfile, onClose: (() -> Unit)?) {
    val accents = LeagueTheme.accents

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(accents.heroStart, accents.heroEnd)))
            .padding(horizontal = 18.dp, vertical = 18.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    TeamBadge(icon = profile.icon, teamColor = Color(profile.color), size = 46)

                    Column {
                        Text(
                            text = profile.name.uppercase(),
                            style = EyebrowStyle,
                            color = accents.onHero.copy(alpha = 0.66f)
                        )
                        Text(
                            text = profile.currentTeam,
                            style = MaterialTheme.typography.headlineSmall,
                            color = accents.onHero
                        )
                    }
                }

                if (onClose != null) {
                    IconButton(onClick = hapticClick(Feedback.Tap, onClose)) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.profile_close),
                            tint = accents.onHero
                        )
                    }
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeroMetric(stringResource(R.string.label_record), formatRecord(profile.wins, profile.losses), Modifier.weight(1f))
                HeroMetric(stringResource(R.string.label_pct), formatWinPct(profile.wins, profile.losses), Modifier.weight(1f))
                HeroMetric(stringResource(R.string.label_seasons), profile.seasonCount.toString(), Modifier.weight(1f))
                HeroMetric(stringResource(R.string.label_points_per_game), formatAverage(profile.pointsPerGame), Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun HeroMetric(label: String, value: String, modifier: Modifier = Modifier) {
    val accents = LeagueTheme.accents

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(accents.onHero.copy(alpha = 0.10f))
            .padding(vertical = 8.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = accents.onHero.copy(alpha = 0.70f),
            textAlign = TextAlign.Center
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            color = accents.onHero
        )
    }
}

@Composable
private fun AchievementRow(
    profile: OwnerProfile,
    profilesById: Map<String, OwnerProfile>,
    modifier: Modifier = Modifier
) {
    val accents = LeagueTheme.accents

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        val hasTitles = profile.championshipYears.isNotEmpty()
        AchievementCard(
            label = stringResource(
                if (hasTitles) R.string.profile_championships else R.string.profile_best_finish
            ),
            value = if (hasTitles) {
                "${repeatGlyph("🏆", profile.titleCount, max = 3)} ${profile.titleCount}"
            } else {
                profile.bestFinish?.let(::ordinal) ?: "—"
            },
            meta = if (hasTitles) {
                profile.championshipYears.joinToString(", ")
            } else {
                profile.bestFinish?.let { profile.yearsFinishing(it).joinToString(", ") } ?: ""
            },
            container = accents.championContainer,
            onContainer = accents.onChampionContainer,
            modifier = Modifier.weight(1f)
        )

        val hasLastPlace = profile.lastPlaceYears.isNotEmpty()
        AchievementCard(
            label = stringResource(
                if (hasLastPlace) R.string.profile_last_place else R.string.profile_lowest_finish
            ),
            value = if (hasLastPlace) {
                "${repeatGlyph("💩", profile.lastPlaceYears.size, max = 3)} ${profile.lastPlaceYears.size}"
            } else {
                profile.worstFinish?.let(::ordinal) ?: "—"
            },
            meta = if (hasLastPlace) {
                profile.lastPlaceYears.joinToString(", ")
            } else {
                profile.worstFinish?.let { profile.yearsFinishing(it).joinToString(", ") } ?: ""
            },
            container = accents.loserContainer,
            onContainer = accents.onLoserContainer,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun AchievementCard(
    label: String,
    value: String,
    meta: String,
    container: Color,
    onContainer: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(container)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(
            text = label.uppercase(),
            style = EyebrowStyle,
            color = onContainer.copy(alpha = 0.75f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            color = onContainer
        )
        if (meta.isNotBlank()) {
            Text(
                text = meta,
                style = MaterialTheme.typography.labelSmall,
                color = onContainer.copy(alpha = 0.75f)
            )
        }
    }
}

@Composable
private fun SeasonHistoryCard(profile: OwnerProfile, modifier: Modifier = Modifier) {
    val accents = LeagueTheme.accents

    SectionCard(
        title = stringResource(R.string.profile_season_by_season),
        icon = "🗓️",
        modifier = modifier
    ) {
        profile.seasons.forEach { season ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = season.year.toString(),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = season.teamName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1
                    )
                    Text(
                        text = "${ordinal(season.finalRank)} · ${formatPoints(season.pointsFor)} PF",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Text(
                    text = formatRecord(season.wins, season.losses),
                    style = MaterialTheme.typography.titleSmall,
                    color = if (season.wins >= season.losses) accents.positive else accents.negative
                )
            }
        }
    }
}

@Composable
private fun HeadToHeadCard(
    profile: OwnerProfile,
    profilesById: Map<String, OwnerProfile>,
    sort: SortState<HeadToHeadSortKey>,
    onSortKey: (HeadToHeadSortKey) -> Unit,
    onDirectionToggle: () -> Unit,
    onSelectOpponent: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val accents = LeagueTheme.accents
    var expanded by remember { mutableStateOf(false) }

    val rows = StandingsSort.headToHead(
        rows = profile.headToHead.values.toList(),
        opponentName = { id -> profilesById[id]?.currentTeam ?: id },
        state = sort
    )

    SectionCard(
        title = stringResource(R.string.profile_head_to_head),
        icon = "⚔️",
        modifier = modifier,
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    TextButton(onClick = hapticClick(Feedback.Select) { expanded = true }) {
                        Text(sort.key.label, style = MaterialTheme.typography.labelLarge)
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        HeadToHeadSortKey.entries.forEach { key ->
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
    ) {
        rows.forEach { row ->
            val opponent = profilesById[row.opponentId] ?: return@forEach

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .hapticClickable(
                        feedback = Feedback.Tap,
                        onClickLabel = "Open ${opponent.currentTeam} history",
                        onClick = { onSelectOpponent(row.opponentId) }
                    )
                    .padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                TeamIdentity(
                    icon = opponent.icon,
                    teamName = opponent.currentTeam,
                    ownerName = opponent.name,
                    teamColor = Color(opponent.color),
                    badgeSize = 32,
                    compact = true,
                    modifier = Modifier.weight(1f)
                )

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = formatRecord(row.wins, row.losses),
                        style = MaterialTheme.typography.titleSmall,
                        color = if (row.wins >= row.losses) accents.positive else accents.negative
                    )
                    Text(
                        text = formatDifferential(row.differential),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
