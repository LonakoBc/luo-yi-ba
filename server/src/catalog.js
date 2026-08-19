import songs from '../../web/src/data/songs.generated.json' with { type: 'json' };
import presets from '../../web/src/data/presets.generated.json' with { type: 'json' };
import { filterSongs, songsForPreset } from '../../web/src/services/libraryService.js';
import { catalogVersionFor } from '../../web/src/services/multiplayerRules.js';

export { songs };
export const songsById = new Map(songs.map((song) => [song.id, song]));
export const catalogVersion = catalogVersionFor(songs);

export function selectPool(selection) {
  if (selection?.kind === 'preset') {
    const preset = presets.find((item) => item.id === selection.presetId);
    return preset ? { songs: songsForPreset(songs, preset), name: preset.name } : null;
  }
  if (selection?.kind === 'custom' && selection.filters) {
    return { songs: filterSongs(songs, selection.filters), name: '自定义曲库' };
  }
  return null;
}
