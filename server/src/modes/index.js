import { GUESS_SONG_MODE, SENIORITY_MODE, SORTING_MODE, TRIATHLON_MODE } from '../../../web/src/services/multiplayerRules.js';
import { GuessSongMode, initialGuessSongState } from './guessSongMode.js';
import { SeniorityMode, initialSeniorityState } from './seniorityMode.js';
import { SortingMode, initialSortingState } from './sortingMode.js';
import { TriathlonMode, initialTriathlonState } from './triathlonMode.js';

const modes = new Map([
  [GUESS_SONG_MODE, { Handler: GuessSongMode, initialState: initialGuessSongState }],
  [SENIORITY_MODE, { Handler: SeniorityMode, initialState: initialSeniorityState }],
  [SORTING_MODE, { Handler: SortingMode, initialState: initialSortingState }],
  [TRIATHLON_MODE, { Handler: TriathlonMode, initialState: initialTriathlonState }],
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
