package com.personal.leaguehistory.ui.screens.recordbook

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.personal.leaguehistory.di.ServiceLocator
import com.personal.leaguehistory.domain.model.OwnerProfile
import com.personal.leaguehistory.domain.repository.LeagueRepository
import com.personal.leaguehistory.domain.usecase.AllTimeSortKey
import com.personal.leaguehistory.domain.usecase.HeadToHeadSortKey
import com.personal.leaguehistory.domain.usecase.SortState
import com.personal.leaguehistory.domain.usecase.StandingsSort
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface RecordBookUiState {
    data object Loading : RecordBookUiState
    data class Error(val message: String) : RecordBookUiState

    data class Ready(
        val seasonCount: Int,
        val champions: List<OwnerProfile>,
        val losers: List<OwnerProfile>,
        val allTime: List<OwnerProfile>,
        val allTimeSort: SortState<AllTimeSortKey>,
        val headToHeadSort: SortState<HeadToHeadSortKey>,
        val profilesById: Map<String, OwnerProfile>
    ) : RecordBookUiState
}

class RecordBookViewModel(
    private val repository: LeagueRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<RecordBookUiState>(RecordBookUiState.Loading)
    val uiState: StateFlow<RecordBookUiState> = _uiState.asStateFlow()

    private var allTimeSort = SortState(AllTimeSortKey.WINS, AllTimeSortKey.WINS.defaultDirection)
    private var headToHeadSort = SortState(HeadToHeadSortKey.WINS, HeadToHeadSortKey.WINS.defaultDirection)

    init {
        load()
    }

    fun load() {
        _uiState.value = RecordBookUiState.Loading

        viewModelScope.launch {
            runCatching {
                val league = repository.league()
                val profiles = repository.profiles()
                league to profiles
            }.onSuccess { (league, profiles) ->
                val values = profiles.values.toList()
                _uiState.value = RecordBookUiState.Ready(
                    seasonCount = league.seasons.size,
                    champions = StandingsSort.champions(values),
                    losers = StandingsSort.losers(values),
                    allTime = StandingsSort.allTime(values, allTimeSort),
                    allTimeSort = allTimeSort,
                    headToHeadSort = headToHeadSort,
                    profilesById = profiles
                )
            }.onFailure { error ->
                _uiState.value = RecordBookUiState.Error(
                    error.message ?: "The bundled record book could not be read."
                )
            }
        }
    }

    /** Tapping the active column flips direction; a new column takes its default. */
    fun onAllTimeSort(key: AllTimeSortKey) {
        allTimeSort = if (allTimeSort.key == key) {
            allTimeSort.copy(direction = allTimeSort.direction.toggled())
        } else {
            SortState(key, key.defaultDirection)
        }
        reSort()
    }

    fun onAllTimeDirectionToggle() {
        allTimeSort = allTimeSort.copy(direction = allTimeSort.direction.toggled())
        reSort()
    }

    fun onHeadToHeadSort(key: HeadToHeadSortKey) {
        headToHeadSort = if (headToHeadSort.key == key) {
            headToHeadSort.copy(direction = headToHeadSort.direction.toggled())
        } else {
            SortState(key, key.defaultDirection)
        }
        reSort()
    }

    fun onHeadToHeadDirectionToggle() {
        headToHeadSort = headToHeadSort.copy(direction = headToHeadSort.direction.toggled())
        reSort()
    }

    private fun reSort() {
        _uiState.update { current ->
            if (current !is RecordBookUiState.Ready) return@update current
            current.copy(
                allTime = StandingsSort.allTime(current.profilesById.values.toList(), allTimeSort),
                allTimeSort = allTimeSort,
                headToHeadSort = headToHeadSort
            )
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val application = checkNotNull(this[APPLICATION_KEY])
                RecordBookViewModel(ServiceLocator.leagueRepository(application))
            }
        }
    }
}
