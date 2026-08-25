const DIFFICULTY_STAGES = [
  { minScore: 0, label: '跨年入门', minYears: 2, maxYears: 3 },
  { minScore: 5, label: '年代进阶', minYears: 1, maxYears: 2 },
  { minScore: 10, label: '相邻年份', minYears: 1, maxYears: 1 },
  { minScore: 15, label: '同年较量', minYears: 0, maxYears: 0 },
];

function weightedChoice(items, random) {
  const total = items.reduce((sum, song) => sum + 1 + Math.min(song.concertCount ?? 0, 3), 0);
  let target = random() * total;
  for (const song of items) {
    target -= 1 + Math.min(song.concertCount ?? 0, 3);
    if (target < 0) return song;
  }
  return items.at(-1);
}

function difficultyForScore(score) {
  return [...DIFFICULTY_STAGES].reverse().find(({ minScore }) => score >= minScore);
}

function yearOf(song) {
  return Number(song.releaseMonth.slice(0, 4));
}

function difficultyPenalty(anchor, candidate, stage) {
  const difference = Math.abs(yearOf(anchor) - yearOf(candidate));
  if (difference < stage.minYears) return stage.minYears - difference;
  if (difference > stage.maxYears) return difference - stage.maxYears;
  return 0;
}

function pickCandidate(songs, anchor, score, usedIds, random) {
  const legal = songs.filter((song) => song.id !== anchor.id && song.releaseMonth !== anchor.releaseMonth);
  if (!legal.length) return null;
  const unused = legal.filter((song) => !usedIds.has(song.id));
  if (!unused.length) return null;
  const pool = unused;
  const stage = difficultyForScore(score);
  const minimumPenalty = Math.min(...pool.map((song) => difficultyPenalty(anchor, song, stage)));
  return weightedChoice(pool.filter((song) => difficultyPenalty(anchor, song, stage) === minimumPenalty), random);
}

function correctSong(left, right, direction) {
  if (direction === 'newer') return left.releaseMonth > right.releaseMonth ? left : right;
  return left.releaseMonth < right.releaseMonth ? left : right;
}

function createRound(number, left, right, direction) {
  return {
    number,
    left,
    right,
    selectedId: null,
    correctId: correctSong(left, right, direction).id,
    direction,
    outcome: null,
  };
}

export function seniorityEvaluation(score, direction = 'older') {
  if (direction === 'newer') {
    if (score >= 25) return { title: '追新雷达满格', description: '曲库的新鲜气息完全逃不过你的耳朵。' };
    if (score >= 15) return { title: '新曲观察员', description: '同一年里的月份差也能被你准确捕捉。' };
    if (score >= 10) return { title: '潮流听众', description: '相邻年份的新旧变化已经非常清晰。' };
    if (score >= 5) return { title: '小有新意', description: '你已经能辨认不少曲目的发布时间了。' };
    return { title: '正在追新', description: '再听几首，很快就能建立自己的曲库年表。' };
  }
  if (score >= 25) return { title: '活化石级资历', description: 'V 家年表已经刻进你的 DNA。' };
  if (score >= 15) return { title: '曲库考古家', description: '同一年里的月份差也逃不过你的耳朵。' };
  if (score >= 10) return { title: '资深听众', description: '相邻年份的时代气息已经非常清晰。' };
  if (score >= 5) return { title: '小有资历', description: '你已经能辨认不少曲目的年代了。' };
  return { title: '初来乍到', description: '再听几首，很快就能建立自己的曲库年表。' };
}

export function createSeniorityService(rawSongs, { random = Math.random, direction = 'older' } = {}) {
  if (!['older', 'newer'].includes(direction)) throw new Error('未知的发布时间比较模式');
  const songs = rawSongs.filter((song) => /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth));
  if (songs.length < 2) throw new Error('至少需要两首发布时间有效的歌曲');

  function startGame() {
    const first = weightedChoice(songs, random);
    const usedIds = new Set([first.id]);
    const second = pickCandidate(songs, first, 0, usedIds, random);
    if (!second) throw new Error('题库中没有发布时间不同的可比较歌曲');
    usedIds.add(second.id);
    return {
      status: 'playing',
      lives: 3,
      score: 0,
      direction,
      round: createRound(1, first, second, direction),
      history: [],
      usedIds: [...usedIds],
      revealedSongIds: [],
      carrySide: null,
      selectionStreakSongId: null,
      selectionStreakCount: 0,
    };
  }

  function choose(game, songId) {
    if (game.status !== 'playing') return game;
    const { left, right } = game.round;
    if (songId !== left.id && songId !== right.id) return game;
    const isCorrect = songId === game.round.correctId;
    const round = { ...game.round, selectedId: songId, outcome: isCorrect ? 'correct' : 'wrong' };
    const lives = game.lives - (isCorrect ? 0 : 1);
    const continuesStreak = isCorrect && game.selectionStreakSongId === songId;
    const selectionStreakSongId = isCorrect ? songId : null;
    const selectionStreakCount = isCorrect ? continuesStreak ? game.selectionStreakCount + 1 : 1 : 0;
    return {
      ...game,
      status: lives === 0 ? 'lost' : game.usedIds.length >= songs.length ? 'completed' : 'revealed',
      lives,
      score: game.score + (isCorrect ? 1 : 0),
      round,
      history: [...game.history, round],
      revealedSongIds: [...new Set([...(game.revealedSongIds ?? []), left.id, right.id])],
      carrySide: songId === left.id ? 'left' : 'right',
      selectionStreakSongId,
      selectionStreakCount,
    };
  }

  function nextRound(game) {
    if (game.status !== 'revealed') return game;
    const replaceRepeatedOldSong = game.selectionStreakCount >= 3;
    const carrySide = replaceRepeatedOldSong ? game.carrySide === 'left' ? 'right' : 'left' : game.carrySide;
    const usedIds = new Set(game.usedIds);
    let resolvedCarrySide = carrySide;
    let anchor = game.round[resolvedCarrySide];
    let next = pickCandidate(songs, anchor, game.score, usedIds, random);
    if (!next) {
      resolvedCarrySide = resolvedCarrySide === 'left' ? 'right' : 'left';
      anchor = game.round[resolvedCarrySide];
      next = pickCandidate(songs, anchor, game.score, usedIds, random);
    }
    if (!next) return { ...game, status: 'completed' };
    usedIds.add(next.id);
    const left = resolvedCarrySide === 'left' ? anchor : next;
    const right = resolvedCarrySide === 'right' ? anchor : next;
    return {
      ...game,
      status: 'playing',
      round: createRound(game.round.number + 1, left, right, direction),
      usedIds: [...usedIds],
      carrySide: null,
      selectionStreakSongId: replaceRepeatedOldSong ? null : game.selectionStreakSongId,
      selectionStreakCount: replaceRepeatedOldSong ? 0 : game.selectionStreakCount,
    };
  }

  function settle(game) {
    if (game.status === 'lost' || game.status === 'settled' || game.status === 'completed') return game;
    const history = game.status === 'playing'
      ? [...game.history, { ...game.round, outcome: 'unanswered' }]
      : game.history;
    return { ...game, status: 'settled', history };
  }

  return { songs, startGame, choose, nextRound, settle };
}

export { difficultyForScore };
