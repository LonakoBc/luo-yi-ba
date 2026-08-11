export const SORTING_MODES = {
  timeline: {
    id: 'timeline',
    name: '时间线排序',
    description: '将歌曲按发布时间从早到晚排列。',
  },
  years: {
    id: 'years',
    name: '年份归位',
    description: '把每首歌曲放入正确的发布年份。',
  },
};

const CARD_THEMES = [
  { surface: '#EAF7FF', border: '#66BFEA', ink: '#174C68' },
  { surface: '#FFF0F7', border: '#E67BAB', ink: '#6A2446' },
  { surface: '#F2EEFF', border: '#9A83E8', ink: '#403070' },
  { surface: '#EEFFF8', border: '#54BE91', ink: '#195C42' },
  { surface: '#FFF7E8', border: '#E5A94B', ink: '#694614' },
  { surface: '#FFF0EC', border: '#E47A65', ink: '#6E2D21' },
  { surface: '#F0FAED', border: '#78B95E', ink: '#315922' },
  { surface: '#FDEFFF', border: '#C979D2', ink: '#612D68' },
  { surface: '#EAFBFB', border: '#4FB7B8', ink: '#155556' },
  { surface: '#F5F1E9', border: '#A99268', ink: '#514326' },
];

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function validSongs(songs) {
  return songs.filter((song) => /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth));
}

function selectUnique(songs, count, keyFor, random) {
  const selected = [];
  const keys = new Set();
  for (const song of shuffle(validSongs(songs), random)) {
    const key = keyFor(song);
    if (keys.has(key)) continue;
    keys.add(key);
    selected.push(song);
    if (selected.length === count) return selected;
  }
  throw new Error(`当前曲库不足以生成 ${count} 首发布时间互异的题目`);
}

export function createSortingPuzzle(songs, { mode = 'timeline', count = 5, random = Math.random } = {}) {
  if (!SORTING_MODES[mode]) throw new Error('未知的歌曲大排序模式');
  if (![5, 10].includes(count)) throw new Error('题量只能是 5 首或 10 首');
  const keyFor = mode === 'timeline' ? (song) => song.releaseMonth : (song) => song.releaseMonth.slice(0, 4);
  const selected = selectUnique(songs, count, keyFor, random);
  const answer = [...selected].sort((a, b) => a.releaseMonth.localeCompare(b.releaseMonth));
  let shuffled = shuffle(selected, random);
  if (shuffled.every((song, index) => song.id === answer[index].id)) shuffled = [...shuffled.slice(1), shuffled[0]];
  const themes = shuffle(CARD_THEMES, random);
  return {
    mode,
    count,
    answer,
    initialOrder: shuffled,
    years: answer.map((song) => song.releaseMonth.slice(0, 4)),
    cardThemes: Object.fromEntries(shuffled.map((song, index) => [song.id, themes[index % themes.length]])),
  };
}

export function scoreTimeline(order, answer) {
  const answerIndex = new Map(answer.map((song, index) => [song.id, index]));
  let correctPairs = 0;
  let totalPairs = 0;
  for (let left = 0; left < order.length; left += 1) {
    for (let right = left + 1; right < order.length; right += 1) {
      totalPairs += 1;
      if (answerIndex.get(order[left].id) < answerIndex.get(order[right].id)) correctPairs += 1;
    }
  }
  return {
    correctPairs,
    totalPairs,
    percentage: totalPairs ? Math.round((correctPairs / totalPairs) * 100) : 0,
  };
}

export function scoreYears(assignments, answer) {
  return answer.reduce((score, song) => score + (assignments[song.id] === song.releaseMonth.slice(0, 4) ? 1 : 0), 0);
}
