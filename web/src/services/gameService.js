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
    idSearchKey: normalizeSearchText(song.id),
  };
}

function exact(value) {
  return { state: 'exact', direction: null };
}

function miss(direction = null) {
  return { state: 'miss', direction };
}

function evaluateYear(guessYear, answerYear) {
  if (guessYear === answerYear) return exact();
  return {
    state: Math.abs(guessYear - answerYear) === 1 ? 'near' : 'miss',
    direction: answerYear > guessYear ? 'up' : 'down',
  };
}

export function countTitleCharacters(title) {
  return String(title ?? '').normalize('NFKC').match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

function sameMembers(left, right) {
  return left.length === right.length && left.every((member) => right.includes(member));
}

export function evaluateGuess(guess, answer) {
  const isCorrect = guess.id === answer.id;
  if (isCorrect) {
    return {
      isCorrect: true,
      title: exact(),
      staff: exact(),
      year: exact(),
      voicebank: exact(),
      vocalType: exact(),
    };
  }

  const sharedStaff = guess.staffMembers.some((member) => answer.staffMembers.includes(member));
  const guessTitleLength = countTitleCharacters(guess.title);
  const answerTitleLength = countTitleCharacters(answer.title);
  return {
    isCorrect: false,
    title: guessTitleLength === answerTitleLength ? exact() : miss(answerTitleLength > guessTitleLength ? 'up' : 'down'),
    staff: sameMembers(guess.staffMembers, answer.staffMembers)
      ? exact()
      : sharedStaff ? { state: 'near', direction: null } : miss(),
    year: evaluateYear(guess.year, answer.year),
    voicebank: guess.voicebank === answer.voicebank ? exact() : miss(),
    vocalType: guess.vocalType === answer.vocalType ? exact() : miss(),
  };
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.floor(random() * length));
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
      .filter((song) => song.titleSearchKey.includes(key) || song.idSearchKey.includes(key))
      .sort((a, b) => {
        const aExact = a.titleSearchKey === key || a.idSearchKey === key;
        const bExact = b.titleSearchKey === key || b.idSearchKey === key;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.title.localeCompare(b.title, 'zh-CN');
      })
      .slice(0, limit);
  }

  function resolveSong(query) {
    const key = normalizeSearchText(query);
    if (!key) return null;
    const exactSong = songs.find((song) => song.titleSearchKey === key || song.idSearchKey === key);
    if (exactSong) return exactSong;
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
    const nextGame = {
      ...game,
      guesses: [{ song, feedback }, ...game.guesses],
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
