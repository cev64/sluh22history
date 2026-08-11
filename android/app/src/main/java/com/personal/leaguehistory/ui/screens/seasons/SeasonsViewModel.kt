package com.personal.leaguehistory.ui.screens.seasons

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.personal.leaguehistory.di.ServiceLocator
import com.personal.leaguehistory.domain.model.Season
import com.personal.leaguehistory.domain.model.SeasonTeam
import com.personal.leaguehistory.domain.repository.LeagueRepository
import com.personal.leaguehistory.domain.usecase.SeasonSortKey
import com.personal.leaguehistory.domain.usecase.SortState
import com.personal.leaguehistory.domain.usecase.StandingsSort
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Which table the season pane is showing. */
enum class SeasonView { REGULAR, FINAL }

data class SeasonSummary(
    val year: Int,
    val championTeam: String?,
    val championIcon: String,
    val championColor: Long,
    val teamCount: Int
)

sealed interface SeasonsUiState {
    data object Loading : SeasonsUiState
    data class Error(val message: String) : SeasonsUiState

    data class Ready(
        val summaries: List<SeasonSummary>,
        val seasonsByYear: Map<Int, Season>,
        val view: SeasonView,
        val sort: SortState<SeasonSortKey>
    ) : SeasonsUiState {
        /** Rows for [year], ordered by the active sort and view. */
        fun rowsFor(year: Int): List<SeasonTeam> {
            val season = seasonsByYear[year] ?: return emptyList()
            val teams = season.teams.values.toList()

            return when (view) {
                // The regular-season table ranks by record, ignoring where the
                // playoffs eventually placed each team.
                SeasonView.REGULAR -> if (sort.key == SeasonSortKey.PLACE) {
                    teams.sortedWith(
                        compareByDescending<SeasonTeam> { it.wins }.thenByDescending { it.pointsFor }
                    )
                } else {
                    StandingsSort.season(teams, sort)
                }

                SeasonView.FINAL -> StandingsSort.season(teams, sort)
            }
        }
    }
}

class SeasonsViewModel(private val repository: LeagueRepository) : ViewModel() {

    private val _uiState = MutableStateFlow<SeasonsUiState>(SeasonsUiState.Loading)
    val uiState: StateFlow<SeasonsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = SeasonsUiState.Loading

        viewModelScope.launch {
            runCatching { repository.league() }
                .onSuccess { league ->
                    _uiState.value = SeasonsUiState.Ready(
                        summaries = league.seasons
                            .sortedByDescending { it.year }
                            .map { season ->
                                val champion = season.champion
                                SeasonSummary(
                                    year = season.year,
                                    championTeam = champion?.name,
                                    championIcon = champion?.icon.orEmpty(),
                                    championColor = champion?.color ?: 0xFF5F7086,
                                    teamCount = season.teamCount
                                )
                            },
                        seasonsByYear = league.seasons.associateBy { it.year },
                        view = SeasonView.FINAL,
                        sort = SortState(SeasonSortKey.PLACE, SeasonSortKey.PLACE.defaultDirection)
                    )
                }
                .onFailure { error ->
                    _uiState.value = SeasonsUiState.Error(
                        error.message ?: "The bundled record book could not be read."
                    )
                }
        }
    }

    fun onViewChange(view: SeasonView) {
        _uiState.update { current ->
            if (current !is SeasonsUiState.Ready) return@update current

            // Each table has its own natural default ordering.
            val sort = when (view) {
                SeasonView.REGULAR -> SortState(SeasonSortKey.RECORD, SortDirectionDescending)
                SeasonView.FINAL -> SortState(SeasonSortKey.PLACE, SeasonSortKey.PLACE.defaultDirection)
            }
            current.copy(view = view, sort = sort)
        }
    }

    fun onSort(key: SeasonSortKey) {
        _uiState.update { current ->
            if (current !is SeasonsUiState.Ready) return@update current

            val sort = if (current.sort.key == key) {
                current.sort.copy(direction = current.sort.direction.toggled())
            } else {
                SortState(key, key.defaultDirection)
            }
            current.copy(sort = sort)
        }
    }

    fun onDirectionToggle() {
        _uiState.update { current ->
            if (current !is SeasonsUiState.Ready) return@update current
            current.copy(sort = current.sort.copy(direction = current.sort.direction.toggled()))
        }
    }

    companion object {
        private val SortDirectionDescending = com.personal.leaguehistory.domain.usecase.SortDirection.DESC

        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val application = checkNotNull(this[APPLICATION_KEY])
                SeasonsViewModel(ServiceLocator.leagueRepository(application))
            }
        }
    }
}
