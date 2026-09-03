import { CROSSWORD_MODE, GUESS_SONG_MODE, MUSIC_GUESS_MODE, PARTY_MODE, PRODUCER_MODE, SENIORITY_MODE, SORTING_MODE, TRIATHLON_MODE } from '../../../web/src/services/multiplayerRules.js';
import { GuessSongMode, initialGuessSongState } from './guessSongMode.js';
import { SeniorityMode, initialSeniorityState } from './seniorityMode.js';
import { SortingMode, initialSortingState } from './sortingMode.js';
import { TriathlonMode, initialTriathlonState } from './triathlonMode.js';
import { CrosswordMode, initialCrosswordState } from './crosswordMode.js';
import { ProducerMode, initialProducerState } from './producerMode.js';
import { MusicGuessMode, initialMusicGuessState } from './musicGuessMode.js';

const modes = new Map([
  [GUESS_SONG_MODE, { Handler: GuessSongMode, initialState: initialGuessSongState }],
  [SENIORITY_MODE, { Handler: SeniorityMode, initialState: initialSeniorityState }],
  [SORTING_MODE, { Handler: SortingMode, initialState: initialSortingState }],
  [TRIATHLON_MODE, { Handler: TriathlonMode, initialState: initialTriathlonState }],
  [PARTY_MODE, { Handler: TriathlonMode, initialState: initialTriathlonState }],
  [CROSSWORD_MODE, { Handler: CrosswordMode, initialState: initialCrosswordState }],
  [PRODUCER_MODE, { Handler: ProducerMode, initialState: initialProducerState }],
  [MUSIC_GUESS_MODE, { Handler: MusicGuessMode, initialState: initialMusicGuessState }],
]);

export function supportsMode(mode) {
  return modes.has(mode);
}

export function createModeHandler(mode, session) {
  const definition = modes.get(mode);
  if (!definition) throw new Error(`Unsupported multiplayer mode: ${mode}`);
  return new definition.Handler(session);
}

export function initialModeState(mode) {
  const definition = modes.get(mode);
  if (!definition) throw new Error(`Unsupported multiplayer mode: ${mode}`);
  return definition.initialState();
}
