export function normalizeDatabaseSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/gu, ' ').trim();
}

export function databaseOptions(songs) {
  const unique = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const years = unique(songs.map((song) => song.releaseMonth.slice(0, 4))).sort();
  return {
    singers: unique(songs.flatMap((song) => song.singerMembers)),
    voicebanks: unique(songs.flatMap((song) => song.voicebankMembers)),
    specials: unique(songs.map((song) => song.special)),
    years,
  };
}

export function initialDatabaseFilters(songs) {
  const years = databaseOptions(songs).years;
  return {
    query: '', singer: '', voicebank: '', special: '',
    startYear: years[0] ?? '', endYear: years.at(-1) ?? '',
  };
}

export function filterDatabaseSongs(songs, filters) {
  const query = normalizeDatabaseSearch(filters.query);
  return songs.filter((song) => {
    const haystack = normalizeDatabaseSearch(`${song.title} ${song.staff} ${song.lyrics}`);
    const year = song.releaseMonth.slice(0, 4);
    return (!query || haystack.includes(query))
      && (!filters.singer || song.singerMembers.includes(filters.singer))
      && (!filters.voicebank || song.voicebankMembers.includes(filters.voicebank))
      && (!filters.special || song.special === filters.special)
      && (!filters.startYear || year >= filters.startYear)
      && (!filters.endYear || year <= filters.endYear);
  });
}

const SORT_VALUES = {
  index: (song) => song.index,
  title: (song) => song.title,
  releaseMonth: (song) => song.releaseMonth,
  singers: (song) => song.singers,
  voicebanks: (song) => song.voicebanks,
  concertCount: (song) => song.concertCount,
  special: (song) => song.special,
};

export function sortDatabaseSongs(songs, sort) {
  const valueFor = SORT_VALUES[sort.key] ?? SORT_VALUES.releaseMonth;
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...songs].sort((left, right) => {
    const a = valueFor(left);
    const b = valueFor(right);
    const compared = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'zh-CN', { numeric: true });
    return compared ? compared * direction : left.index - right.index;
  });
}
