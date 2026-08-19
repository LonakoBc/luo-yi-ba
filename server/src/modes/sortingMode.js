import crypto from 'node:crypto';
import { songsById } from '../catalog.js';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  SORTING_MODE,
  SORTING_REVEAL_DURATION_MS,
  SORTING_ROUND_DURATION_MS,
  SORTING_SONGS_PER_ROUND,
  playerSeatFor,
  rankPlayers,
  resolvedPlayerColor,
  scoreSortingTimeline,
  sortingRoundScores,
} from '../../../web/src/services/multiplayerRules.js';

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function validSong(song) {
  return /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song?.releaseMonth);
}

function createSchedule(room) {
  const buckets = new Map();
  for (const song of shuffle(room.poolSongIds.map((id) => songsById.get(id)).filter(validSong))) {
    const bucket = buckets.get(song.releaseMonth) ?? [];
    bucket.push(song);
    buckets.set(song.releaseMonth, bucket);
  }
  const schedule = [];
  for (let round = 0; round < room.roundCount; round += 1) {
    const available = shuffle([...buckets.entries()].filter(([, songs]) => songs.length > 0))
      .sort((left, right) => right[1].length - left[1].length);
    if (available.length < SORTING_SONGS_PER_ROUND) throw new Error('当前曲库无法生成发布时间互异的排序题目');
    const selected = available.slice(0, SORTING_SONGS_PER_ROUND).map(([, songs]) => songs.pop());
    const answerIds = [...selected].sort((left, right) => left.releaseMonth.localeCompare(right.releaseMonth)).map(({ id }) => id);
    let initialOrderIds = shuffle(selected).map(({ id }) => id);
    if (initialOrderIds.every((id, index) => id === answerIds[index])) initialOrderIds = [...initialOrderIds.slice(1), initialOrderIds[0]];
    schedule.push({ initialOrderIds, answerIds });
  }
  return schedule;
}

function publicSong(song, reveal) {
  return {
    id: song.id,
    title: song.title,
    staffDisplay: song.staffDisplay,
    singersDisplay: song.singersDisplay,
    special: song.special,
    imageUrl: song.imageUrl,
    releaseMonth: reveal ? song.releaseMonth : null,
  };
}

function validOrder(orderIds, expectedIds) {
  return Array.isArray(orderIds) && orderIds.length === expectedIds.length
    && new Set(orderIds).size === expectedIds.length && orderIds.every((id) => expectedIds.includes(id));
}

export function initialSortingState() {
  return {
    sortingSchedule: [],
    sortingRound: null,
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
  };
}

export class SortingMode {
  constructor(session) {
    this.session = session;
  }

  get room() { return this.session.room; }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') {
      await this.startMatch(player, socket);
      return true;
    }
    if (message.type === 'update_sorting_order') {
      await this.updateOrder(player, message.orderIds, socket);
      return true;
    }
    if (message.type === 'submit_sorting_order') {
      await this.submitOrder(player, message.orderIds, socket);
      return true;
    }
    return false;
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
    if (this.room.players.length !== this.room.capacity) return this.session.sendError(socket, '等待玩家坐满后才能开始');
    try { this.room.sortingSchedule = createSchedule(this.room); }
    catch (error) { return this.session.sendError(socket, error.message); }
    await this.startRound();
  }

  async startRound() {
    const roundNumber = this.room.roundNumber + 1;
    const round = this.room.sortingSchedule[roundNumber - 1];
    const now = Date.now();
    Object.assign(this.room, {
      roundNumber,
      phase: 'playing',
      sortingRound: round,
      startedAt: now,
      endsAt: now + SORTING_ROUND_DURATION_MS,
      nextRoundAt: null,
    });
    this.room.players.forEach((player) => Object.assign(player, {
      roundScore: 0,
      sortingOrderIds: [...round.initialOrderIds],
      sortingMoveCount: 0,
      sortingSubmittedAt: null,
      sortingSubmitted: false,
      sortingCorrectPairs: null,
      sortingTotalPairs: null,
      sortingPercentage: null,
      sortingRoundRank: null,
    }));
    await this.session.save();
    this.session.broadcast();
  }

  async updateOrder(player, orderIds, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能调整排序');
    if (player.sortingSubmitted) return this.session.sendError(socket, '排序已经提交并锁定');
    if (!validOrder(orderIds, this.room.sortingRound.initialOrderIds)) return this.session.sendError(socket, '排序内容无效');
    if (orderIds.some((id, index) => id !== player.sortingOrderIds[index])) {
      player.sortingOrderIds = [...orderIds];
      player.sortingMoveCount += 1;
      await this.session.save();
      this.session.broadcast();
    }
  }

  async submitOrder(player, orderIds, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能提交排序');
    if (Date.now() >= this.room.endsAt) return this.session.sendError(socket, '本轮已经结束');
    if (player.sortingSubmitted) return this.session.sendError(socket, '排序已经提交并锁定');
    if (!validOrder(orderIds, this.room.sortingRound.initialOrderIds)) return this.session.sendError(socket, '排序内容无效');
    player.sortingOrderIds = [...orderIds];
    player.sortingSubmitted = true;
    player.sortingSubmittedAt = Date.now();
    if (this.room.players.every((item) => item.sortingSubmitted)) await this.revealRound();
    else { await this.session.save(); this.session.broadcast(); }
  }

  async revealRound() {
    if (this.room.phase !== 'playing') return;
    const results = this.room.players.map((player) => {
      const score = player.sortingSubmitted ? scoreSortingTimeline(player.sortingOrderIds, this.room.sortingRound.answerIds) : null;
      Object.assign(player, {
        sortingCorrectPairs: score?.correctPairs ?? 0,
        sortingTotalPairs: score?.totalPairs ?? 10,
        sortingPercentage: score?.percentage ?? 0,
      });
      return { id: player.id, joinOrder: player.joinOrder, submitted: player.sortingSubmitted, correctPairs: player.sortingCorrectPairs };
    });
    const points = sortingRoundScores(results);
    const ordered = [...results].sort((left, right) => right.correctPairs - left.correctPairs || left.joinOrder - right.joinOrder);
    let previousPairs = null;
    let rank = 0;
    ordered.forEach((result, index) => {
      if (result.correctPairs !== previousPairs) rank = index + 1;
      previousPairs = result.correctPairs;
      const player = this.room.players.find(({ id }) => id === result.id);
      player.sortingRoundRank = result.submitted && result.correctPairs > 0 ? rank : null;
      player.roundScore = points.get(player.id);
      player.score += player.roundScore;
    });
    this.room.phase = 'round-result';
    this.room.nextRoundAt = Date.now() + SORTING_REVEAL_DURATION_MS;
    await this.session.save();
    this.session.broadcast();
  }

  async finishMatch() {
    this.room.phase = 'finished';
    this.room.nextRoundAt = null;
    await this.session.save();
    this.session.broadcast();
  }

  async tick(now) {
    if (this.room.phase === 'playing' && now >= this.room.endsAt) await this.revealRound();
    else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
      if (this.room.roundNumber >= this.room.roundCount) await this.finishMatch();
      else await this.startRound();
    }
  }

  addScheduleTimes(times) {
    if (this.room.phase === 'playing') times.push(this.room.endsAt);
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
  }

  project(viewerId) {
    const reveal = ['round-result', 'finished'].includes(this.room.phase);
    const commonPlayer = (player) => ({
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
      moveCount: player.sortingMoveCount,
      submitted: player.sortingSubmitted,
      orderIds: reveal || player.id === viewerId ? player.sortingOrderIds : null,
      correctPairs: reveal ? player.sortingCorrectPairs : null,
      totalPairs: reveal ? player.sortingTotalPairs : null,
      percentage: reveal ? player.sortingPercentage : null,
      roundRank: reveal ? player.sortingRoundRank : null,
    });
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      mode: SORTING_MODE,
      code: this.room.code,
      phase: this.room.phase,
      capacity: this.room.capacity,
      roundCount: this.room.roundCount,
      roundNumber: this.room.roundNumber,
      hostId: this.room.hostId,
      poolName: this.room.poolName,
      selection: this.room.selection,
      startedAt: this.room.startedAt,
      endsAt: this.room.endsAt,
      nextRoundAt: this.room.nextRoundAt,
      sortingRound: this.room.sortingRound ? {
        songs: this.room.sortingRound.initialOrderIds.map((id) => publicSong(songsById.get(id), reveal)),
        answerIds: reveal ? this.room.sortingRound.answerIds : null,
      } : null,
      players: this.room.players.map(commonPlayer),
      ranking: this.room.phase === 'finished' ? rankPlayers(this.room.players).map((player) => ({
        id: player.id, nickname: player.nickname, score: player.score, rank: player.rank,
        seatIndex: player.seatIndex, seat: playerSeatFor(player.seatIndex ?? player.joinOrder),
        colorId: resolvedPlayerColor(player)?.id ?? null, color: resolvedPlayerColor(player),
      })) : null,
      serverNow: Date.now(),
    };
  }
}
