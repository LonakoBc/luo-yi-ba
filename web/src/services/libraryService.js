const VOICEBANK_LABELS = new Map([
  ['ACE Studio', 'ACE'],
  ['X Studio', 'XStudio'],
]);

function uniqueBy(values, keyFor) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getLibraryOptions(songs) {
  const years = songs.map((song) => Number(song.releaseMonth.slice(0, 4)));
  const collections = uniqueBy(songs.flatMap((song) => song.sourceLibraries ?? []), (item) => item.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const singers = [...new Set(songs.flatMap((song) => song.singerMembers))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const voicebanks = [...new Set(songs.flatMap((song) => song.voicebankMembers))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((value) => ({ value, label: VOICEBANK_LABELS.get(value) ?? value }));
  return {
    minYear: Math.min(...years),
    maxYear: Math.max(...years),
    collections,
    singers,
    voicebanks,
    specials: [...new Set(songs.map((song) => song.special))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  };
}

export function createDefaultFilters(songs) {
  const options = getLibraryOptions(songs);
  return {
    collections: options.collections.map(({ id }) => id),
    singers: [],
    voicebanks: options.voicebanks.map(({ value }) => value),
    specials: [...options.specials],
    fromYear: options.minYear,
    toYear: options.maxYear,
    concertOnly: false,
  };
}

export function filterSongs(songs, filters) {
  if (!filters.collections.length || !filters.voicebanks.length || !filters.specials.length) return [];
  const collections = new Set(filters.collections);
  const singers = new Set(filters.singers);
  const voicebanks = new Set(filters.voicebanks);
  const specials = new Set(filters.specials);
  return songs.filter((song) => {
    const year = Number(song.releaseMonth.slice(0, 4));
    return (song.sourceLibraries ?? []).some(({ id }) => collections.has(id))
      && [...singers].every((singer) => song.singerMembers.includes(singer))
      && song.voicebankMembers.every((voicebank) => voicebanks.has(voicebank))
      && specials.has(song.special)
      && year >= filters.fromYear
      && year <= filters.toYear
      && (!filters.concertOnly || song.concertCount > 0);
  });
}

function listFromParams(params, key, allowed, fallback) {
  if (!params.has(key)) return [...fallback];
  const allowedSet = new Set(allowed);
  return params.get(key).split('|').filter((value) => allowedSet.has(value));
}

export function filtersFromSearch(search, songs) {
  const defaults = createDefaultFilters(songs);
  const options = getLibraryOptions(songs);
  const params = new URLSearchParams(search);
  const fromYear = Math.max(options.minYear, Math.min(options.maxYear, Number(params.get('from')) || defaults.fromYear));
  const toYear = Math.max(fromYear, Math.min(options.maxYear, Number(params.get('to')) || defaults.toYear));
  return {
    collections: listFromParams(params, 'collections', options.collections.map(({ id }) => id), defaults.collections),
    singers: listFromParams(params, 'singers', options.singers, defaults.singers),
    voicebanks: listFromParams(params, 'voicebanks', options.voicebanks.map(({ value }) => value), defaults.voicebanks),
    specials: listFromParams(params, 'specials', options.specials, defaults.specials),
    fromYear,
    toYear,
    concertOnly: params.get('concert') === '1',
  };
}

export function filtersToSearch(filters) {
  const params = new URLSearchParams();
  params.set('collections', filters.collections.join('|'));
  params.set('singers', filters.singers.join('|'));
  params.set('voicebanks', filters.voicebanks.join('|'));
  params.set('specials', filters.specials.join('|'));
  params.set('from', String(filters.fromYear));
  params.set('to', String(filters.toYear));
  params.set('concert', filters.concertOnly ? '1' : '0');
  return params.toString();
}

export function songsForPreset(songs, preset) {
  if (!preset) return [];
  if (preset.songIds?.length) {
    const byId = new Map(songs.map((song) => [song.id, song]));
    return preset.songIds.map((id) => byId.get(id)).filter(Boolean);
  }
  const byTitle = new Map(songs.map((song) => [song.title, song]));
  return preset.titles.map((title) => byTitle.get(title)).filter(Boolean);
}
