export function normalizeProducerSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\p{P}\p{S}\s]+/gu, '');
}

function direction(answer, guess) {
  if (answer === guess) return null;
  return answer > guess ? 'up' : 'down';
}

function scalarFeedback(answer, guess, threshold) {
  const difference = Math.abs(answer - guess);
  return { state: difference === 0 ? 'exact' : difference <= threshold ? 'near' : 'miss', direction: direction(answer, guess) };
}

export function evaluateProducerGuess(answer, guess) {
  const answerSongs = new Set(answer.representativeSongs.map(normalizeProducerSearch));
  return {
    isCorrect: answer.id === guess.id,
    name: { state: answer.id === guess.id ? 'exact' : 'miss' },
    debutYear: scalarFeedback(answer.debutYear, guess.debutYear, 2),
    debutSong: { state: normalizeProducerSearch(answer.debutSong) === normalizeProducerSearch(guess.debutSong) ? 'exact' : 'miss' },
    hallCount: scalarFeedback(answer.hallCount, guess.hallCount, Math.max(2, Math.ceil(answer.hallCount * 0.2))),
    legendCount: scalarFeedback(answer.legendCount, guess.legendCount, Math.max(2, Math.ceil(answer.legendCount * 0.2))),
    mythCount: scalarFeedback(answer.mythCount, guess.mythCount, Math.max(2, Math.ceil(answer.mythCount * 0.2))),
    representativeSongs: guess.representativeSongs.map((song) => ({ song, matched: answerSongs.has(normalizeProducerSearch(song)) })),
  };
}

export function createProducerGameService(producers, { random = Math.random } = {}) {
  if (!producers.length) throw new Error('P 主候选池不能为空');
  const byId = new Map(producers.map((producer) => [producer.id, producer]));
  const choose = (previousId, forcedId) => {
    if (forcedId && byId.has(forcedId)) return byId.get(forcedId);
    const pool = producers.length > 1 ? producers.filter((producer) => producer.id !== previousId) : producers;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  };
  return {
    producers,
    startGame(previousId = null, forcedId = null) {
      return { answer: choose(previousId, forcedId), guesses: [], hintLevel: 0, yearDebutRevealed: false, status: 'playing' };
    },
    search(query, guessedIds = new Set()) {
      const normalized = normalizeProducerSearch(query);
      if (!normalized) return [];
      return producers.filter((producer) => !guessedIds.has(producer.id) && producer.searchKeys.some((key) => key.includes(normalized))).slice(0, 8);
    },
    resolveProducer(query) {
      const normalized = normalizeProducerSearch(query);
      const matches = producers.filter((producer) => producer.searchKeys.some((key) => key === normalized));
      return matches.length === 1 ? matches[0] : null;
    },
    submitGuess(game, producerId) {
      if (game.status !== 'playing') return { error: '本局已经结束' };
      const producer = byId.get(producerId);
      if (!producer) return { error: '没有找到这位 P 主' };
      if (game.guesses.some((entry) => entry.producer.id === producerId)) return { error: '这位 P 主已经猜过了' };
      const feedback = evaluateProducerGuess(game.answer, producer);
      return { game: { ...game, guesses: [{ producer, feedback }, ...game.guesses], yearDebutRevealed: game.yearDebutRevealed || producer.debutYear === game.answer.debutYear, status: feedback.isCorrect ? 'won' : 'playing' } };
    },
    useHint(game) { return game.status === 'playing' ? { ...game, hintLevel: Math.min(3, game.hintLevel + 1) } : game; },
    surrender(game) { return game.status === 'playing' ? { ...game, status: 'surrendered' } : game; },
  };
}
