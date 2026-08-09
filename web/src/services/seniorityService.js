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
  if (!legal.length) throw new Error('题库中没有发布时间不同的可比较歌曲');
  const unused = legal.filter((song) => !usedIds.has(song.id));
  const pool = unused.length ? unused : legal;
  const stage = difficultyForScore(score);
  const minimumPenalty = Math.min(...pool.map((song) => difficultyPenalty(anchor, song, stage)));
  return weightedChoice(pool.filter((song) => difficultyPenalty(anchor, song, stage) === minimumPenalty), random);
}

function correctSong(left, right) {
  return left.releaseMonth < right.releaseMonth ? left : right;
}

function createRound(number, left, right) {
  return {
    number,
    left,
    right,
    selectedId: null,
    correctId: correctSong(left, right).id,
    outcome: null,
  };
}

export function seniorityEvaluation(score) {
  if (score >= 25) return { title: '活化石级资历', description: 'V 家年表已经刻进你的 DNA。' };
  if (score >= 15) return { title: '曲库考古家', description: '同一年里的月份差也逃不过你的耳朵。' };
  if (score >= 10) return { title: '资深听众', description: '相邻年份的时代气息已经非常清晰。' };
  if (score >= 5) return { title: '小有资历', description: '你已经能辨认不少曲目的年代了。' };
  return { title: '初来乍到', description: '再听几首，很快就能建立自己的曲库年表。' };
}

export function createSeniorityService(rawSongs, { random = Math.random } = {}) {
  const songs = rawSongs.filter((song) => /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth));
  if (songs.length < 2) throw new Error('至少需要两首发布时间有效的歌曲');

  function startGame() {
    const first = weightedChoice(songs, random);
    const usedIds = new Set([first.id]);
    const second = pickCandidate(songs, first, 0, usedIds, random);
    usedIds.add(second.id);
    return {
      status: 'playing',
      lives: 3,
      score: 0,
      round: createRound(1, first, second),
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
      status: lives === 0 ? 'lost' : 'revealed',
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
    const anchor = game.round[carrySide];
    const usedIds = new Set(game.usedIds);
    const next = pickCandidate(songs, anchor, game.score, usedIds, random);
    usedIds.add(next.id);
    const left = carrySide === 'left' ? anchor : next;
    const right = carrySide === 'right' ? anchor : next;
    return {
      ...game,
      status: 'playing',
      round: createRound(game.round.number + 1, left, right),
      usedIds: [...usedIds],
      carrySide: null,
      selectionStreakSongId: replaceRepeatedOldSong ? null : game.selectionStreakSongId,
      selectionStreakCount: replaceRepeatedOldSong ? 0 : game.selectionStreakCount,
    };
  }

  function settle(game) {
    if (game.status === 'lost' || game.status === 'settled') return game;
    const history = game.status === 'playing'
      ? [...game.history, { ...game.round, outcome: 'unanswered' }]
      : game.history;
    return { ...game, status: 'settled', history };
  }

  return { songs, startGame, choose, nextRound, settle };
}

export { difficultyForScore };
