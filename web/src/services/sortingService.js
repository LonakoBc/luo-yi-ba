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
  return {
    mode,
    count,
    answer,
    initialOrder: shuffled,
    years: answer.map((song) => song.releaseMonth.slice(0, 4)),
  };
}

export function scoreTimeline(order, answer) {
  return order.reduce((score, song, index) => score + (song.id === answer[index].id ? 1 : 0), 0);
}

export function scoreYears(assignments, answer) {
  return answer.reduce((score, song) => score + (assignments[song.id] === song.releaseMonth.slice(0, 4) ? 1 : 0), 0);
}

