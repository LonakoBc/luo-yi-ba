import { evaluateGuess } from './gameService';

export const MULTIPLAYER_PROTOCOL_VERSION = 1;
export const MULTIPLAYER_MODE = 'guess-song';
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROUND_DURATION_MS = 180_000;
export const ROUND_BREAK_MS = 10_000;
export const HOST_RECONNECT_GRACE_MS = 10_000;
export const ROOM_RETENTION_MS = 30 * 60_000;
export const SCORE_BY_PLACE = [5, 3, 2, 1];

export function catalogVersionFor(songs) {
  let hash = 2166136261;
  for (const song of songs) {
    for (const char of song.id) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  }
  return `v1-${songs.length}-${(hash >>> 0).toString(36)}`;
}

export const HINT_STEPS = [
  { level: 1, afterMs: 60_000 },
  { level: 2, afterMs: 120_000 },
  { level: 3, afterMs: 150_000 },
];

export function allowedRoundCounts(capacity) {
  return capacity === 2 ? [1, 3, 5] : [3, 5, 7];
}

export function validateMatchConfig({ capacity, roundCount, songCount }) {
  if (![2, 3, 4].includes(capacity)) return '房间人数必须为 2–4 人';
  if (!allowedRoundCounts(capacity).includes(roundCount)) return '轮数不适用于当前房间人数';
  if (!Number.isInteger(songCount) || songCount < roundCount) return '当前曲库歌曲数不足';
  return null;
}

export function hintLevelAt(startedAt, now) {
  const elapsed = now - startedAt;
  if (elapsed >= 150_000) return 3;
  if (elapsed >= 120_000) return 2;
  if (elapsed >= 60_000) return 1;
  return 0;
}

export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.joinOrder - b.joinOrder);
  let rank = 0;
  let previousScore = null;
  return sorted.map((player, index) => {
    if (player.score !== previousScore) rank = index + 1;
    previousScore = player.score;
    return { ...player, rank };
  });
}

export function applyGuess({ player, song, answer, receivedAt, endsAt, correctCount }) {
  if (receivedAt >= endsAt) return { error: '本轮已经结束' };
  if (player.roundScore > 0) return { error: '你已经猜出本轮答案' };
  if (player.guesses.some((guess) => guess.song.id === song.id)) return { error: '这首歌已经猜过了' };
  const feedback = evaluateGuess(song, answer);
  const points = feedback.isCorrect ? (SCORE_BY_PLACE[correctCount] ?? 0) : 0;
  return { feedback, points };
}

export function publicAnswer(answer, hintLevel, revealAll = false) {
  if (!answer) return null;
  const result = {};
  if (revealAll) {
    return {
      id: answer.id, title: answer.title, releaseMonth: answer.releaseMonth,
      singersDisplay: answer.singersDisplay, staffDisplay: answer.staffDisplay,
      lyrics: answer.lyrics, bilibiliUrl: answer.bilibiliUrl, vcpediaUrl: answer.vcpediaUrl,
    };
  }
  if (hintLevel >= 1) Object.assign(result, { releaseMonth: answer.releaseMonth, singersDisplay: answer.singersDisplay });
  if (hintLevel >= 2) result.staffDisplay = answer.staffDisplay;
  if (hintLevel >= 3) result.lyrics = answer.lyrics;
  return result;
}

export function projectRoom(room, viewerId) {
  const revealAll = ['round-result', 'finished'].includes(room.phase);
  return {
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    mode: MULTIPLAYER_MODE,
    code: room.code,
    phase: room.phase,
    capacity: room.capacity,
    roundCount: room.roundCount,
    roundNumber: room.roundNumber,
    hostId: room.hostId,
    poolName: room.poolName,
    selection: room.selection,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    nextRoundAt: room.nextRoundAt,
    hintLevel: room.hintLevel,
    answer: publicAnswer(room.answer, room.hintLevel, revealAll),
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      joinOrder: player.joinOrder,
      online: player.online,
      score: player.score,
      roundScore: player.roundScore,
      solved: player.roundScore > 0,
      guesses: player.id === viewerId
        ? player.guesses.map(({ song, feedback, receivedAt }) => ({ song, feedback, receivedAt }))
        : player.guesses.map(({ feedback, receivedAt }, index) => ({ index: index + 1, receivedAt, isCorrect: feedback.isCorrect })),
    })),
    ranking: room.phase === 'finished' ? rankPlayers(room.players).map(({ id, nickname, score, rank }) => ({ id, nickname, score, rank })) : null,
    serverNow: Date.now(),
  };
}
