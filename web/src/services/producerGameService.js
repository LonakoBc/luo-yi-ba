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
  const answerSongs = new Set((answer?.representativeSongs ?? []).map(normalizeProducerSearch));
  return {
    isCorrect: Boolean(answer && guess && answer.id === guess.id),
    name: { state: answer?.id === guess?.id ? 'exact' : 'miss' },
    debutYear: scalarFeedback(answer?.debutYear ?? 0, guess?.debutYear ?? 0, 2),
    debutSong: { state: normalizeProducerSearch(answer?.debutSong) === normalizeProducerSearch(guess?.debutSong) ? 'exact' : 'miss' },
    hallCount: scalarFeedback(answer?.hallCount ?? 0, guess?.hallCount ?? 0, Math.max(2, Math.ceil((answer?.hallCount ?? 0) * 0.2))),
    legendCount: scalarFeedback(answer?.legendCount ?? 0, guess?.legendCount ?? 0, Math.max(2, Math.ceil((answer?.legendCount ?? 0) * 0.2))),
    mythCount: scalarFeedback(answer?.mythCount ?? 0, guess?.mythCount ?? 0, Math.max(2, Math.ceil((answer?.mythCount ?? 0) * 0.2))),
    representativeSongs: (guess?.representativeSongs ?? []).map((song) => ({ song, matched: answerSongs.has(normalizeProducerSearch(song)) })),
  };
}

export function createProducerGameService(producers, { random = Math.random } = {}) {
  const source = (Array.isArray(producers) ? producers : []).filter((producer) => producer?.id);
  if (!source.length) throw new Error('P 主候选池不能为空');
  const normalizedProducers = source.map((producer) => ({
    ...producer,
    aliases: Array.isArray(producer.aliases) ? producer.aliases : [],
    representativeSongs: Array.isArray(producer.representativeSongs) ? producer.representativeSongs : [],
    searchKeys: Array.isArray(producer.searchKeys) && producer.searchKeys.length
      ? producer.searchKeys
      : [producer.name, ...(Array.isArray(producer.aliases) ? producer.aliases : [])].map(normalizeProducerSearch),
  }));
  const byId = new Map(normalizedProducers.map((producer) => [producer.id, producer]));
  const choose = (previousId, forcedId) => {
    if (forcedId && byId.has(forcedId)) return byId.get(forcedId);
    const pool = normalizedProducers.length > 1 ? normalizedProducers.filter((producer) => producer.id !== previousId) : normalizedProducers;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  };
  return {
    producers: normalizedProducers,
    startGame(previousId = null, forcedId = null) {
      return { answer: choose(previousId, forcedId), guesses: [], hintLevel: 0, yearDebutRevealed: false, status: 'playing' };
    },
    search(query, guessedIds = new Set()) {
      const normalized = normalizeProducerSearch(query);
      if (!normalized) return [];
      return normalizedProducers.filter((producer) => !guessedIds.has(producer.id) && producer.searchKeys.some((key) => key.includes(normalized))).slice(0, 8);
    },
    resolveProducer(query) {
      const normalized = normalizeProducerSearch(query);
      const matches = normalizedProducers.filter((producer) => producer.searchKeys.some((key) => key === normalized));
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
