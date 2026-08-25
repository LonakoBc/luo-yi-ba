import { evaluateGuess } from './gameService.js';

export const MULTIPLAYER_PROTOCOL_VERSION = 3;
export const GUESS_SONG_MODE = 'guess-song';
export const SENIORITY_MODE = 'seniority';
export const SORTING_MODE = 'sorting';
export const TRIATHLON_MODE = 'triathlon';
export const MULTIPLAYER_MODE = GUESS_SONG_MODE;
export const MULTIPLAYER_MODES = Object.freeze([GUESS_SONG_MODE, SENIORITY_MODE, SORTING_MODE, TRIATHLON_MODE]);
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROUND_DURATION_MS = 90_000;
export const ROUND_BREAK_MS = 10_000;
export const HOST_RECONNECT_GRACE_MS = 10_000;
export const ROOM_RETENTION_MS = 30 * 60_000;
export const SCORE_BY_PLACE = [5, 3, 2, 1];
export const SENIORITY_ROUND_DURATION_MS = 12_000;
export const SENIORITY_REVEAL_DURATION_MS = 4_000;
export const SENIORITY_CORRECT_BASE_SCORE = 2;
export const SENIORITY_SPEED_BONUS = Object.freeze([3, 2, 1, 0]);
export const SENIORITY_ROUND_COUNTS = Object.freeze([5, 10, 15]);
export const SORTING_ROUND_DURATION_MS = 60_000;
export const SORTING_REVEAL_DURATION_MS = 10_000;
export const SORTING_SONGS_PER_ROUND = 5;
export const SORTING_ROUND_COUNTS = Object.freeze([3, 5, 7]);
export const TRIATHLON_STAGE_ROUNDS = 3;
export const TRIATHLON_TOTAL_ROUNDS = 9;

export const PLAYER_COLORS = Object.freeze([
  Object.freeze({ id: 'luotianyi', singerName: '洛天依', colorName: '天依蓝', color: '#66CCFF' }),
  Object.freeze({ id: 'yuezhengling', singerName: '乐正绫', colorName: '乐正绫红', color: '#EE0000' }),
  Object.freeze({ id: 'yanhe', singerName: '言和', colorName: '言和绿', color: '#00FFCC' }),
  Object.freeze({ id: 'xingchen', singerName: '星尘', colorName: '星尘紫', color: '#9999FF' }),
  Object.freeze({ id: 'longya', singerName: '乐正龙牙', colorName: '龙牙绿', color: '#006666' }),
  Object.freeze({ id: 'zhiyu-moke', singerName: '徵羽摩柯', colorName: '摩柯蓝', color: '#5B8FF9' }),
  Object.freeze({ id: 'moqingxian', singerName: '墨清弦', colorName: '清弦黄', color: '#FFFF00' }),
  Object.freeze({ id: 'xinhua', singerName: '心华', colorName: '心华紫', color: '#EE82EE' }),
  Object.freeze({ id: 'haiyi', singerName: '海伊', colorName: '海伊蓝', color: '#5BCFFA' }),
  Object.freeze({ id: 'cangqiong', singerName: '苍穹', colorName: '苍穹紫', color: '#9999FF' }),
  Object.freeze({ id: 'chiyu', singerName: '赤羽', colorName: '赤羽红', color: '#EE6666' }),
  Object.freeze({ id: 'shian', singerName: '诗岸', colorName: '诗岸金', color: '#F6C65B' }),
  Object.freeze({ id: 'muxin', singerName: '牧心', colorName: '牧心紫', color: '#72519A' }),
  Object.freeze({ id: 'minus', singerName: '永夜Minus', colorName: '永夜灰', color: '#45455A' }),
]);

export const DEFAULT_PLAYER_COLOR_IDS = Object.freeze(['luotianyi', 'yuezhengling', 'yanhe', 'xingchen']);

export function playerColorFor(colorId) {
  return PLAYER_COLORS.find(({ id }) => id === colorId) ?? null;
}

export const PLAYER_SEATS = Object.freeze([
  Object.freeze({ index: 0, number: 1 }),
  Object.freeze({ index: 1, number: 2 }),
  Object.freeze({ index: 2, number: 3 }),
  Object.freeze({ index: 3, number: 4 }),
]);

export function playerSeatFor(index) {
  return PLAYER_SEATS[index] ?? null;
}

export function resolvedPlayerColor(player) {
  return playerColorFor(player?.colorId) ?? playerColorFor(DEFAULT_PLAYER_COLOR_IDS[player?.seatIndex ?? player?.joinOrder]);
}

export function catalogVersionFor(songs) {
  let hash = 2166136261;
  for (const song of songs) {
    for (const char of song.id) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  }
  return `v1-${songs.length}-${(hash >>> 0).toString(36)}`;
}

export const HINT_STEPS = [
  { level: 1, afterMs: 30_000 },
  { level: 2, afterMs: 60_000 },
  { level: 3, afterMs: 75_000 },
];

export function allowedRoundCounts(capacity, mode = GUESS_SONG_MODE) {
  if (mode === SENIORITY_MODE) return [...SENIORITY_ROUND_COUNTS];
  if (mode === SORTING_MODE) return [...SORTING_ROUND_COUNTS];
  if (mode === TRIATHLON_MODE) return [TRIATHLON_TOTAL_ROUNDS];
  return capacity === 2 ? [1, 3, 5] : [3, 5, 7];
}

export function validateMatchConfig({ capacity, roundCount, songCount, mode = GUESS_SONG_MODE }) {
  if (!MULTIPLAYER_MODES.includes(mode)) return '联机玩法无效';
  if (![2, 3, 4].includes(capacity)) return '房间人数必须为 2–4 人';
  if (!allowedRoundCounts(capacity, mode).includes(roundCount)) return '轮数不适用于当前玩法或房间人数';
  const minimumSongs = mode === SENIORITY_MODE ? 2
    : mode === SORTING_MODE ? roundCount * SORTING_SONGS_PER_ROUND
      : mode === TRIATHLON_MODE ? SORTING_SONGS_PER_ROUND : roundCount;
  if (!Number.isInteger(songCount) || songCount < minimumSongs) return '当前曲库歌曲数不足';
  return null;
}

export function seniorityDifficultyForRound(roundNumber, roundCount) {
  const progress = (roundNumber - 1) / Math.max(1, roundCount);
  if (progress < 1 / 3) return { label: '跨年入门', minYears: 2, maxYears: 3 };
  if (progress < 2 / 3) return { label: '年代进阶', minYears: 1, maxYears: 2 };
  return { label: '资历决胜', minYears: 0, maxYears: 1 };
}

export function seniorityChoiceScore(correctOrder) {
  return SENIORITY_CORRECT_BASE_SCORE + (SENIORITY_SPEED_BONUS[correctOrder] ?? 0);
}

export function scoreSortingTimeline(orderIds, answerIds) {
  if (!Array.isArray(orderIds) || !Array.isArray(answerIds) || orderIds.length !== answerIds.length
    || new Set(orderIds).size !== answerIds.length || orderIds.some((id) => !answerIds.includes(id))) return null;
  const answerIndex = new Map(answerIds.map((id, index) => [id, index]));
  let correctPairs = 0;
  let totalPairs = 0;
  for (let left = 0; left < orderIds.length; left += 1) {
    for (let right = left + 1; right < orderIds.length; right += 1) {
      totalPairs += 1;
      if (answerIndex.get(orderIds[left]) < answerIndex.get(orderIds[right])) correctPairs += 1;
    }
  }
  return { correctPairs, totalPairs, percentage: totalPairs ? Math.round((correctPairs / totalPairs) * 100) : 0 };
}

export function sortingRoundScores(results) {
  const submitted = results.filter((result) => result.submitted && result.correctPairs > 0)
    .sort((left, right) => right.correctPairs - left.correctPairs || left.joinOrder - right.joinOrder);
  let previousPairs = null;
  let rank = 0;
  const points = new Map();
  submitted.forEach((result, index) => {
    if (result.correctPairs !== previousPairs) rank = index + 1;
    previousPairs = result.correctPairs;
    points.set(result.id, SCORE_BY_PLACE[rank - 1] ?? 0);
  });
  return new Map(results.map((result) => [result.id, points.get(result.id) ?? 0]));
}

export function hintLevelAt(startedAt, now) {
  const elapsed = now - startedAt;
  return HINT_STEPS.reduce((level, step) => elapsed >= step.afterMs ? step.level : level, 0);
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

export function summarizeFeedback(feedback) {
  const state = (entry) => entry?.state ?? 'miss';
  return {
    isCorrect: feedback.isCorrect,
    title: { state: feedback.isCorrect ? 'exact' : 'neutral', direction: null },
    staff: { state: state(feedback.staff), direction: null },
    releaseMonth: {
      year: { state: state(feedback.releaseMonth?.year) },
      month: { state: state(feedback.releaseMonth?.month) },
      direction: feedback.releaseMonth?.direction ?? null,
    },
    singers: { state: state(feedback.singers), direction: null },
    voicebanks: { state: state(feedback.voicebanks), direction: null },
    concertCount: { state: state(feedback.concertCount), direction: feedback.concertCount?.direction ?? null },
    special: { state: state(feedback.special), direction: null },
  };
}

export function isFinalRound(roundNumber, roundCount) {
  return roundNumber >= roundCount;
}

export function roundCompletionState(roundNumber, roundCount, now) {
  const finished = isFinalRound(roundNumber, roundCount);
  return { phase: finished ? 'finished' : 'round-result', nextRoundAt: finished ? null : now + ROUND_BREAK_MS };
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
    mode: room.mode ?? MULTIPLAYER_MODE,
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
      seatIndex: player.seatIndex,
      seat: playerSeatFor(player.seatIndex ?? player.joinOrder),
      colorId: resolvedPlayerColor(player)?.id ?? null,
      color: resolvedPlayerColor(player),
      online: player.online,
      score: player.score,
      roundScore: player.roundScore,
      solved: player.roundScore > 0,
      guesses: player.id === viewerId
        ? player.guesses.map(({ song, feedback, receivedAt }) => ({ song, feedback, receivedAt }))
        : player.guesses.map(({ feedback, receivedAt }, index) => ({ index: index + 1, receivedAt, isCorrect: feedback.isCorrect, feedback: summarizeFeedback(feedback) })),
    })),
    ranking: room.phase === 'finished' ? rankPlayers(room.players).map((player) => ({
      id: player.id, nickname: player.nickname, score: player.score, rank: player.rank,
      seatIndex: player.seatIndex, seat: playerSeatFor(player.seatIndex ?? player.joinOrder),
      colorId: resolvedPlayerColor(player)?.id ?? null, color: resolvedPlayerColor(player),
    })) : null,
    serverNow: Date.now(),
  };
}
