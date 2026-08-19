import crypto from 'node:crypto';
import { songsById } from '../catalog.js';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  SENIORITY_REVEAL_DURATION_MS,
  SENIORITY_ROUND_DURATION_MS,
  SENIORITY_MODE,
  playerSeatFor,
  rankPlayers,
  resolvedPlayerColor,
  seniorityChoiceScore,
  seniorityDifficultyForRound,
} from '../../../web/src/services/multiplayerRules.js';

function yearOf(song) {
  return Number(song.releaseMonth.slice(0, 4));
}

function difficultyPenalty(left, right, difficulty) {
  const difference = Math.abs(yearOf(left) - yearOf(right));
  if (difference < difficulty.minYears) return difficulty.minYears - difference;
  if (difference > difficulty.maxYears) return difference - difficulty.maxYears;
  return 0;
}

function randomItem(items) {
  return items[crypto.randomInt(items.length)];
}

function publicSong(song, revealDate) {
  return {
    id: song.id,
    title: song.title,
    staffDisplay: song.staffDisplay,
    singersDisplay: song.singersDisplay,
    special: song.special,
    concertCount: song.concertCount,
    imageUrl: song.imageUrl,
    releaseMonth: revealDate ? song.releaseMonth : null,
  };
}

function pickPair(room, roundNumber) {
  const songs = room.poolSongIds.map((id) => songsById.get(id)).filter((song) => /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song?.releaseMonth));
  const unused = songs.filter((song) => !room.usedSongIds.includes(song.id));
  const anchorPool = unused.length >= 2 ? unused : songs;
  const difficulty = seniorityDifficultyForRound(roundNumber, room.roundCount);
  let fallback;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const left = randomItem(anchorPool);
    const legal = songs.filter((song) => song.id !== left.id && song.releaseMonth !== left.releaseMonth);
    const unusedLegal = legal.filter((song) => !room.usedSongIds.includes(song.id));
    const candidates = unusedLegal.length ? unusedLegal : legal;
    const minimumPenalty = Math.min(...candidates.map((song) => difficultyPenalty(left, song, difficulty)));
    const right = randomItem(candidates.filter((song) => difficultyPenalty(left, song, difficulty) === minimumPenalty));
    const pairKey = [left.id, right.id].sort().join('|');
    fallback = { left, right, pairKey, correctId: left.releaseMonth < right.releaseMonth ? left.id : right.id, difficulty };
    if (!(room.usedPairKeys ?? []).includes(pairKey)) return fallback;
  }
  return fallback;
}

export function initialSeniorityState() {
  return {
    usedSongIds: [],
    usedPairKeys: [],
    seniorityPair: null,
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
  };
}

export class SeniorityMode {
  constructor(session) {
    this.session = session;
  }

  get room() { return this.session.room; }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') {
      await this.startMatch(player, socket);
      return true;
    }
    if (message.type === 'submit_seniority_choice') {
      await this.submitChoice(player, message.songId, socket);
      return true;
    }
    return false;
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
    if (this.room.players.length !== this.room.capacity) return this.session.sendError(socket, '等待玩家坐满后才能开始');
    await this.startRound();
  }

  async startRound() {
    const roundNumber = this.room.roundNumber + 1;
    const pair = pickPair(this.room, roundNumber);
    const now = Date.now();
    Object.assign(this.room, {
      roundNumber,
      phase: 'playing',
      seniorityPair: { leftId: pair.left.id, rightId: pair.right.id, correctId: pair.correctId, difficulty: pair.difficulty },
      usedSongIds: [...new Set([...this.room.usedSongIds, pair.left.id, pair.right.id])],
      usedPairKeys: [...(this.room.usedPairKeys ?? []), pair.pairKey],
      startedAt: now,
      endsAt: now + SENIORITY_ROUND_DURATION_MS,
      nextRoundAt: null,
    });
    this.room.players.forEach((item) => {
      item.roundScore = 0;
      item.roundChoiceId = null;
      item.roundAnsweredAt = null;
      item.roundCorrect = null;
    });
    await this.session.save();
    this.session.broadcast();
  }

  async submitChoice(player, songId, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能提交选择');
    const receivedAt = Date.now();
    if (receivedAt >= this.room.endsAt) return this.session.sendError(socket, '本题已经结束');
    if (player.roundChoiceId) return this.session.sendError(socket, '本题已经作答');
    const pairIds = [this.room.seniorityPair.leftId, this.room.seniorityPair.rightId];
    if (!pairIds.includes(songId)) return this.session.sendError(socket, '选择不属于当前题目');
    const correct = songId === this.room.seniorityPair.correctId;
    const correctOrder = this.room.players.filter((item) => item.roundCorrect === true).length;
    const points = correct ? seniorityChoiceScore(correctOrder) : 0;
    Object.assign(player, { roundChoiceId: songId, roundAnsweredAt: receivedAt, roundCorrect: correct, roundScore: points });
    player.score += points;
    if (this.room.players.every((item) => item.roundChoiceId)) await this.revealRound();
    else { await this.session.save(); this.session.broadcast(); }
  }

  async revealRound() {
    if (this.room.phase !== 'playing') return;
    this.room.phase = 'round-result';
    this.room.nextRoundAt = Date.now() + SENIORITY_REVEAL_DURATION_MS;
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
    const pair = this.room.seniorityPair;
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
      answered: Boolean(player.roundChoiceId),
      choiceId: reveal || player.id === viewerId ? player.roundChoiceId : null,
      correct: reveal ? player.roundCorrect : null,
    });
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      mode: SENIORITY_MODE,
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
      seniorityRound: pair ? {
        left: publicSong(songsById.get(pair.leftId), reveal),
        right: publicSong(songsById.get(pair.rightId), reveal),
        correctId: reveal ? pair.correctId : null,
        difficulty: pair.difficulty,
      } : null,
      players: this.room.players.map(commonPlayer),
      ranking: this.room.phase === 'finished' ? rankPlayers(this.room.players).map((player) => ({
        id: player.id,
        nickname: player.nickname,
        score: player.score,
        rank: player.rank,
        seatIndex: player.seatIndex,
        seat: playerSeatFor(player.seatIndex ?? player.joinOrder),
        colorId: resolvedPlayerColor(player)?.id ?? null,
        color: resolvedPlayerColor(player),
      })) : null,
      serverNow: Date.now(),
    };
  }
}
