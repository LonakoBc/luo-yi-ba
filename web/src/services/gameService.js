const SEARCH_LIMIT = 8;

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]/gu, '');
}

function withSearchKeys(song) {
  return {
    ...song,
    titleSearchKey: normalizeSearchText(song.title),
    slugSearchKey: normalizeSearchText(song.slug ?? song.id),
  };
}

function exact(value) {
  return { state: 'exact', direction: null };
}

function miss(direction = null) {
  return { state: 'miss', direction };
}

function normalizeMember(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
}

function evaluateReleaseMonth(guessValue, answerValue) {
  const [guessYear, guessMonth] = guessValue.split('-').map(Number);
  const [answerYear, answerMonth] = answerValue.split('-').map(Number);
  return {
    year: guessYear === answerYear ? exact() : {
      state: Math.abs(guessYear - answerYear) <= 2 ? 'near' : 'miss',
      direction: null,
    },
    month: guessMonth === answerMonth ? exact() : miss(),
    direction: answerValue === guessValue ? null : answerValue > guessValue ? 'up' : 'down',
  };
}

function evaluateCount(guessCount, answerCount) {
  if (guessCount === answerCount) return exact();
  return {
    state: Math.abs(guessCount - answerCount) <= 2 ? 'near' : 'miss',
    direction: answerCount > guessCount ? 'up' : 'down',
  };
}

function sameMembers(left, right) {
  const normalizedLeft = [...new Set(left.map(normalizeMember))];
  const normalizedRight = [...new Set(right.map(normalizeMember))];
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((member) => normalizedRight.includes(member));
}

function evaluateMembers(guessMembers, answerMembers) {
  const answerSet = new Set(answerMembers.map(normalizeMember));
  const matches = [...new Set(guessMembers.map(normalizeMember).filter((member) => answerSet.has(member)))];
  return {
    state: sameMembers(guessMembers, answerMembers) ? 'exact' : matches.length ? 'partial' : 'miss',
    matches,
    direction: null,
  };
}

export function evaluateGuess(guess, answer) {
  const isCorrect = guess.id === answer.id;
  if (isCorrect) {
    return {
      isCorrect: true,
      title: { state: 'neutral', direction: null },
      staff: evaluateMembers(guess.staffPeople, answer.staffPeople),
      releaseMonth: evaluateReleaseMonth(guess.releaseMonth, answer.releaseMonth),
      singers: evaluateMembers(guess.singerMembers, answer.singerMembers),
      voicebanks: evaluateMembers(guess.voicebankMembers, answer.voicebankMembers),
      concertCount: evaluateCount(guess.concertCount, answer.concertCount),
      special: exact(),
    };
  }

  return {
    isCorrect: false,
    title: { state: 'neutral', direction: null },
    staff: evaluateMembers(guess.staffPeople, answer.staffPeople),
    releaseMonth: evaluateReleaseMonth(guess.releaseMonth, answer.releaseMonth),
    singers: evaluateMembers(guess.singerMembers, answer.singerMembers),
    voicebanks: evaluateMembers(guess.voicebankMembers, answer.voicebankMembers),
    concertCount: evaluateCount(guess.concertCount, answer.concertCount),
    special: guess.special === answer.special ? exact() : miss(),
  };
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function hasExhaustedFeedback(feedback) {
  return !feedback.isCorrect
    && feedback.staff.state === 'exact'
    && feedback.releaseMonth.year.state === 'exact'
    && feedback.singers.state === 'exact'
    && feedback.voicebanks.state === 'exact'
    && feedback.special.state === 'exact';
}

export function createLocalGameService(rawSongs, { random = Math.random } = {}) {
  if (!Array.isArray(rawSongs) || rawSongs.length === 0) {
    throw new Error('题库为空，无法开始游戏');
  }
  const songs = rawSongs.map(withSearchKeys);
  const songsById = new Map(songs.map((song) => [song.id, song]));

  function searchSongs(query, limit = SEARCH_LIMIT) {
    const key = normalizeSearchText(query);
    if (!key) return [];
    return songs
      .filter((song) => song.titleSearchKey.includes(key) || song.slugSearchKey.includes(key))
      .sort((a, b) => {
        const aExact = a.titleSearchKey === key || a.slugSearchKey === key;
        const bExact = b.titleSearchKey === key || b.slugSearchKey === key;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.title.localeCompare(b.title, 'zh-CN');
      })
      .slice(0, limit);
  }

  function resolveSong(query) {
    const key = normalizeSearchText(query);
    if (!key) return null;
    const exactSongs = songs.filter((song) => song.titleSearchKey === key || song.slugSearchKey === key);
    if (exactSongs.length === 1) return exactSongs[0];
    const matches = searchSongs(query, songs.length);
    return matches.length === 1 ? matches[0] : null;
  }

  function startGame(previousAnswerId = null, forcedAnswerId = null) {
    if (forcedAnswerId) {
      const forcedAnswer = songsById.get(forcedAnswerId);
      if (!forcedAnswer) throw new Error('指定答案不在当前模式曲库中');
      return { answer: forcedAnswer, guesses: [], hintLevel: 0, status: 'playing' };
    }
    const candidates = songs.length > 1
      ? songs.filter((song) => song.id !== previousAnswerId)
      : songs;
    const answer = candidates[randomIndex(candidates.length, random)];
    return {
      answer,
      guesses: [],
      hintLevel: 0,
      status: 'playing',
    };
  }

  function submitGuess(game, songId) {
    if (game.status !== 'playing') return { game, error: '游戏已经结束' };
    const song = songsById.get(songId);
    if (!song) return { game, error: '题库中没有这首歌曲' };
    if (game.guesses.some((entry) => entry.song.id === songId)) {
      return { game, error: '这首歌已经猜过了' };
    }

    const feedback = evaluateGuess(song, game.answer);
    const shouldRevealLyrics = hasExhaustedFeedback(feedback);
    const nextGame = {
      ...game,
      guesses: [{ song, feedback }, ...game.guesses],
      hintLevel: shouldRevealLyrics ? 3 : game.hintLevel,
      status: feedback.isCorrect ? 'won' : 'playing',
    };
    return { game: nextGame, error: null };
  }

  function useHint(game) {
    if (game.status !== 'playing' || game.hintLevel >= 3) return game;
    return { ...game, hintLevel: game.hintLevel + 1 };
  }

  function surrender(game) {
    if (game.status !== 'playing') return game;
    return { ...game, status: 'surrendered' };
  }

  return { songs, searchSongs, resolveSong, startGame, submitGuess, useHint, surrender };
}
