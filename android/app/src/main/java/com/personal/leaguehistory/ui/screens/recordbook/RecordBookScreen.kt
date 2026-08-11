package com.personal.leaguehistory.ui.screens.recordbook

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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.personal.leaguehistory.R
import com.personal.leaguehistory.ui.components.ErrorState
import com.personal.leaguehistory.ui.screens.profile.ProfilePane
import com.personal.leaguehistory.ui.theme.EyebrowStyle
import com.personal.leaguehistory.ui.theme.LeagueTheme

@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun RecordBookScreen(
    selectedOwnerId: String?,
    onSelectOwner: (String?) -> Unit,
    viewModel: RecordBookViewModel = viewModel(factory = RecordBookViewModel.Factory)
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val navigator = rememberListDetailPaneScaffoldNavigator<String>()

    // Keep the pane scaffold in step with the hoisted selection, which is what a
    // widget deep link writes to.
    LaunchedEffect(selectedOwnerId) {
        val current = navigator.currentDestination?.content
        if (selectedOwnerId != null && selectedOwnerId != current) {
            navigator.navigateTo(ListDetailPaneScaffoldRole.Detail, selectedOwnerId)
        }
    }

    BackHandler(enabled = navigator.canNavigateBack()) {
        navigator.navigateBack()
        onSelectOwner(null)
    }

    ListDetailPaneScaffold(
        directive = navigator.scaffoldDirective,
        value = navigator.scaffoldValue,
        listPane = {
            AnimatedPane {
                when (val state = uiState) {
                    RecordBookUiState.Loading -> LoadingPane()

                    is RecordBookUiState.Error -> ErrorState(
                        message = state.message,
                        onRetry = viewModel::load
                    )

                    is RecordBookUiState.Ready -> RecordBookList(
                        state = state,
                        selectedOwnerId = navigator.currentDestination?.content,
                        onSelectOwner = onSelectOwner,
                        onAllTimeSort = viewModel::onAllTimeSort,
                        onAllTimeDirectionToggle = viewModel::onAllTimeDirectionToggle
                    )
                }
            }
        },
        detailPane = {
            AnimatedPane {
                val state = uiState
                val ownerId = navigator.currentDestination?.content

                if (state is RecordBookUiState.Ready && ownerId != null) {
                    ProfilePane(
                        profile = state.profilesById[ownerId],
                        profilesById = state.profilesById,
                        headToHeadSort = state.headToHeadSort,
                        onHeadToHeadSort = viewModel::onHeadToHeadSort,
                        onHeadToHeadDirectionToggle = viewModel::onHeadToHeadDirectionToggle,
                        onSelectOpponent = onSelectOwner,
                        onClose = if (navigator.canNavigateBack()) {
                            {
                                navigator.navigateBack()
                                onSelectOwner(null)
                            }
                        } else {
                            null
                        }
                    )
                } else {
                    EmptyDetailPane()
                }
            }
        }
    )
}

@Composable
private fun LoadingPane() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun EmptyDetailPane() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(R.string.profile_empty),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(32.dp)
        )
    }
}

@Composable
private fun RecordBookList(
    state: RecordBookUiState.Ready,
    selectedOwnerId: String?,
    onSelectOwner: (String) -> Unit,
    onAllTimeSort: (com.personal.leaguehistory.domain.usecase.AllTimeSortKey) -> Unit,
    onAllTimeDirectionToggle: () -> Unit
) {
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
        item(key = "hero") {
            RecordBookHero(seasonCount = state.seasonCount)
        }

        item(key = "champions") {
            ChampionsCard(
                profiles = state.champions,
                selectedOwnerId = selectedOwnerId,
                onSelectOwner = onSelectOwner,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }

        item(key = "losers") {
            LosersCard(
                profiles = state.losers,
                selectedOwnerId = selectedOwnerId,
                onSelectOwner = onSelectOwner,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }

        item(key = "all-time") {
            AllTimeCard(
                profiles = state.allTime,
                sort = state.allTimeSort,
                selectedOwnerId = selectedOwnerId,
                onSelectOwner = onSelectOwner,
                onSortKey = onAllTimeSort,
                onDirectionToggle = onAllTimeDirectionToggle,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }
    }
}

/** The navy gradient banner from the top of the site's home page. */
@Composable
private fun RecordBookHero(seasonCount: Int) {
    val accents = LeagueTheme.accents

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(
                Brush.linearGradient(listOf(accents.heroStart, accents.heroEnd))
            )
            .padding(horizontal = 20.dp, vertical = 22.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = stringResource(R.string.home_eyebrow).uppercase(),
                    style = EyebrowStyle,
                    color = accents.onHero.copy(alpha = 0.66f)
                )
                Text(
                    text = stringResource(R.string.home_title),
                    style = MaterialTheme.typography.displaySmall,
                    color = accents.onHero
                )
            }

            Column(
                modifier = Modifier
                    .width(112.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(accents.onHero.copy(alpha = 0.10f))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = seasonCount.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = accents.onHero
                )
                Text(
                    text = stringResource(R.string.home_years_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = accents.onHero.copy(alpha = 0.72f),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
internal fun RowDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outlineVariant)
    )
}
