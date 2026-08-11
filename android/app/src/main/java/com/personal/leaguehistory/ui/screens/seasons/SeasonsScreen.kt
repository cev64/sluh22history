package com.personal.leaguehistory.ui.screens.seasons

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffold
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldRole
import androidx.compose.material3.adaptive.navigation.rememberListDetailPaneScaffoldNavigator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.personal.leaguehistory.R
import com.personal.leaguehistory.domain.usecase.SeasonSortKey
import com.personal.leaguehistory.ui.components.ErrorState
import com.personal.leaguehistory.ui.components.SectionCard
import com.personal.leaguehistory.ui.components.TeamBadge
import com.personal.leaguehistory.ui.components.TeamIdentity
import com.personal.leaguehistory.ui.format.formatDifferential
import com.personal.leaguehistory.ui.format.formatPoints
import com.personal.leaguehistory.ui.format.formatRecord
import com.personal.leaguehistory.ui.format.ordinal
import com.personal.leaguehistory.ui.haptics.Feedback
import com.personal.leaguehistory.ui.haptics.hapticClick
import com.personal.leaguehistory.ui.haptics.hapticClickable
import com.personal.leaguehistory.ui.theme.EyebrowStyle
import com.personal.leaguehistory.ui.theme.LeagueTheme

@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun SeasonsScreen(
    selectedYear: Int?,
    onSelectYear: (Int?) -> Unit,
    onSelectOwner: (String) -> Unit,
    viewModel: SeasonsViewModel = viewModel(factory = SeasonsViewModel.Factory)
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val navigator = rememberListDetailPaneScaffoldNavigator<Int>()

    LaunchedEffect(selectedYear) {
        val current = navigator.currentDestination?.content
        if (selectedYear != null && selectedYear != current) {
            navigator.navigateTo(ListDetailPaneScaffoldRole.Detail, selectedYear)
        }
    }

    BackHandler(enabled = navigator.canNavigateBack()) {
        navigator.navigateBack()
        onSelectYear(null)
    }

    ListDetailPaneScaffold(
        directive = navigator.scaffoldDirective,
        value = navigator.scaffoldValue,
        listPane = {
            AnimatedPane {
                when (val state = uiState) {
                    SeasonsUiState.Loading -> Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) { CircularProgressIndicator() }

                    is SeasonsUiState.Error -> ErrorState(state.message, viewModel::load)

                    is SeasonsUiState.Ready -> SeasonList(
                        state = state,
                        selectedYear = navigator.currentDestination?.content,
                        onSelectYear = onSelectYear
                    )
                }
            }
        },
        detailPane = {
            AnimatedPane {
                val state = uiState
                val year = navigator.currentDestination?.content

                if (state is SeasonsUiState.Ready && year != null) {
                    SeasonDetail(
                        year = year,
                        state = state,
                        onViewChange = viewModel::onViewChange,
                        onSort = viewModel::onSort,
                        onDirectionToggle = viewModel::onDirectionToggle,
                        onSelectOwner = onSelectOwner
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(MaterialTheme.colorScheme.surface),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(R.string.season_choose),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    )
}

@Composable
private fun SeasonList(
    state: SeasonsUiState.Ready,
    selectedYear: Int?,
    onSelectYear: (Int) -> Unit
) {
    val safeInsets = WindowInsets.safeDrawing.asPaddingValues()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(
            top = safeInsets.calculateTopPadding() + 12.dp,
            bottom = safeInsets.calculateBottomPadding() + 24.dp,
            start = 12.dp,
            end = 12.dp
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(state.summaries, key = { it.year }) { summary ->
            SeasonRow(
                summary = summary,
                selected = summary.year == selectedYear,
                onClick = { onSelectYear(summary.year) }
            )
        }
    }
}

@Composable
private fun SeasonRow(
    summary: SeasonSummary,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                if (selected) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.surfaceContainer
            )
            .hapticClickable(
                feedback = Feedback.Tap,
                onClickLabel = "Open the ${summary.year} season",
                onClick = onClick
            )
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = summary.year.toString(),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.widget_reigning_champion).uppercase(),
                style = EyebrowStyle,
                color = LeagueTheme.accents.champion
            )
            Text(
                text = summary.championTeam ?: "—",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
        }

        if (summary.championIcon.isNotBlank()) {
            TeamBadge(
                icon = summary.championIcon,
                teamColor = Color(summary.championColor),
                size = 34
            )
        }
    }
}

@Composable
private fun SeasonDetail(
    year: Int,
    state: SeasonsUiState.Ready,
    onViewChange: (SeasonView) -> Unit,
    onSort: (SeasonSortKey) -> Unit,
    onDirectionToggle: () -> Unit,
    onSelectOwner: (String) -> Unit
) {
    val safeInsets = WindowInsets.safeDrawing.asPaddingValues()
    val rows = state.rowsFor(year)
    val accents = LeagueTheme.accents

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(
            top = safeInsets.calculateTopPadding() + 12.dp,
            bottom = safeInsets.calculateBottomPadding() + 24.dp
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item(key = "tabs") {
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp)
            ) {
                SegmentedButton(
                    selected = state.view == SeasonView.REGULAR,
                    onClick = hapticClick(Feedback.Select) { onViewChange(SeasonView.REGULAR) },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                ) {
                    Text(stringResource(R.string.season_regular))
                }

                SegmentedButton(
                    selected = state.view == SeasonView.FINAL,
                    onClick = hapticClick(Feedback.Select) { onViewChange(SeasonView.FINAL) },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                ) {
                    Text(stringResource(R.string.season_final))
                }
            }
        }

        item(key = "standings") {
            SectionCard(
                title = "$year ${stringResource(
                    if (state.view == SeasonView.REGULAR) R.string.season_regular else R.string.season_final
                )}",
                icon = "🏈",
                modifier = Modifier.padding(horizontal = 12.dp)
            ) {
                rows.forEachIndexed { index, team ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .hapticClickable(
                                feedback = Feedback.Tap,
                                onClickLabel = "Open ${team.name} history",
                                onClick = { onSelectOwner(team.ownerId) }
                            )
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            text = if (state.view == SeasonView.FINAL) {
                                ordinal(team.finalRank)
                            } else {
                                "${index + 1}"
                            },
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        TeamIdentity(
                            icon = team.icon,
                            teamName = team.name,
                            ownerName = team.ownerName,
                            teamColor = Color(team.color),
                            modifier = Modifier.weight(1f)
                        )

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = formatRecord(team.wins, team.losses),
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = formatPoints(team.pointsFor),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Text(
                            text = formatDifferential(team.pointDifferential),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (team.pointDifferential >= 0) accents.positive else accents.negative
                        )
                    }
                }
            }
        }
    }
}
