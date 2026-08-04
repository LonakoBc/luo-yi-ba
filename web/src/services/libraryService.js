export const SINGER_OPTIONS = ['洛天依'];
export const VOICEBANK_OPTIONS = [
  { value: 'VOCALOID', label: 'VOCALOID' },
  { value: 'ACE Studio', label: 'ACE' },
  { value: 'X Studio', label: 'XStudio' },
  { value: 'Synthesizer V', label: 'Synthesizer V' },
];

export function getLibraryOptions(songs) {
  const years = songs.map((song) => Number(song.releaseMonth.slice(0, 4)));
  return {
    minYear: Math.min(...years),
    maxYear: Math.max(...years),
    specials: [...new Set(songs.map((song) => song.special))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  };
}

export function createDefaultFilters(songs) {
  const options = getLibraryOptions(songs);
  return {
    singers: [...SINGER_OPTIONS],
    voicebanks: VOICEBANK_OPTIONS.map(({ value }) => value),
    specials: [...options.specials],
    fromYear: options.minYear,
    toYear: options.maxYear,
    concertOnly: false,
  };
}

export function filterSongs(songs, filters) {
  if (!filters.singers.length || !filters.voicebanks.length || !filters.specials.length) return [];
  const singers = new Set(filters.singers);
  const voicebanks = new Set(filters.voicebanks);
  const specials = new Set(filters.specials);
  return songs.filter((song) => {
    const year = Number(song.releaseMonth.slice(0, 4));
    return [...singers].every((singer) => song.singerMembers.includes(singer))
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
    singers: listFromParams(params, 'singers', SINGER_OPTIONS, defaults.singers),
    voicebanks: listFromParams(params, 'voicebanks', VOICEBANK_OPTIONS.map(({ value }) => value), defaults.voicebanks),
    specials: listFromParams(params, 'specials', options.specials, defaults.specials),
    fromYear,
    toYear,
    concertOnly: params.get('concert') === '1',
  };
}

export function filtersToSearch(filters) {
  const params = new URLSearchParams();
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
  const byTitle = new Map(songs.map((song) => [song.title, song]));
  return preset.titles.map((title) => byTitle.get(title)).filter(Boolean);
}
