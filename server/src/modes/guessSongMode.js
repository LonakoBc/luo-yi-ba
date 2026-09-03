import crypto from 'node:crypto';
import { songsById } from '../catalog.js';
import {
  HINT_STEPS,
  PARTY_MODE,
  ROUND_BREAK_MS,
  ROUND_DURATION_MS,
  applyGuess,
  hintLevelAt,
  projectRoom,
  roundCompletionState,
} from '../../../web/src/services/multiplayerRules.js';

export function initialGuessSongState() {
  return {
    usedSongIds: [],
    answerId: null,
    answer: null,
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
    hintLevel: 0,
  };
}

export class GuessSongMode {
  constructor(session) {
    this.session = session;
  }

  get room() { return this.session.room; }

  project(viewerId) {
    return projectRoom(this.room, viewerId);
  }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') {
      await this.startMatch(player, socket);
      return true;
    }
    if (message.type === 'submit_guess') {
      await this.submitGuess(player, message.songId, socket);
      return true;
    }
    return false;
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
    if (!this.room.players.length) return this.session.sendError(socket, '至少需要一名玩家才能开始');
    await this.startRound();
  }

  async startRound() {
    const candidates = this.room.poolSongIds.filter((id) => !this.room.usedSongIds.includes(id));
    const answerId = candidates[crypto.randomInt(candidates.length)];
    const now = Date.now();
    Object.assign(this.room, {
      roundNumber: this.room.roundNumber + 1,
      phase: 'playing',
      answerId,
      answer: songsById.get(answerId),
      usedSongIds: [...this.room.usedSongIds, answerId],
      startedAt: now,
      endsAt: now + ROUND_DURATION_MS,
      nextRoundAt: null,
      hintLevel: 0,
    });
    this.room.players.forEach((item) => { item.roundScore = 0; item.guesses = []; });
    await this.session.save();
    this.session.broadcast();
  }

  async submitGuess(player, songId, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能提交猜测');
    const song = songsById.get(songId);
    if (!song || !this.room.poolSongIds.includes(songId)) return this.session.sendError(socket, '歌曲不在当前曲库中');
    const receivedAt = Date.now();
    const correctCount = this.room.players.filter((item) => item.roundScore > 0).length;
    const result = applyGuess({ player, song, answer: this.room.answer, receivedAt, endsAt: this.room.endsAt, correctCount });
    if (result.error) return this.session.sendError(socket, result.error);
    player.guesses.push({ song, feedback: result.feedback, receivedAt });
    if (result.points) { player.roundScore = result.points; player.score += result.points; }
    if (this.room.players.every((item) => item.roundScore > 0)) await this.finishRound();
    else { await this.session.save(); this.session.broadcast(); }
  }

  async finishRound() {
    if (this.room.phase !== 'playing') return;
    const now = Date.now();
    Object.assign(this.room, this.room.mode === PARTY_MODE
      ? { phase: 'round-result', nextRoundAt: now + ROUND_BREAK_MS }
      : roundCompletionState(this.room.roundNumber, this.room.roundCount, now));
    await this.session.save();
    this.session.broadcast();
  }

  async tick(now) {
    if (this.room.phase === 'playing') {
      if (now >= this.room.endsAt) await this.finishRound();
      else this.room.hintLevel = hintLevelAt(this.room.startedAt, now);
    } else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
      await this.startRound();
    }
  }

  addScheduleTimes(times) {
    if (this.room.phase === 'playing') {
      for (const step of HINT_STEPS) times.push(this.room.startedAt + step.afterMs);
      times.push(this.room.endsAt);
    }
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
  }
}
