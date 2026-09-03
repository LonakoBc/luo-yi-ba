import crypto from 'node:crypto';
import producers from '../../../web/src/data/producers.generated.json' with { type: 'json' };
import { evaluateProducerGuess } from '../../../web/src/services/producerGameService.js';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  PRODUCER_MODE,
  PRODUCER_REVEAL_DURATION_MS,
  PRODUCER_ROUND_DURATION_MS,
  SCORE_BY_PLACE,
  HINT_STEPS,
  hintLevelAt,
  playerSeatFor,
  rankPlayers,
  resolvedPlayerColor,
} from '../../../web/src/services/multiplayerRules.js';

const FAMOUS_PRODUCERS = producers.filter((producer) => producer.famous);

function randomItem(items) {
  return items[crypto.randomInt(items.length)];
}

function publicProducer(producer, hintLevel = 0, revealAll = false, yearDebutRevealed = false) {
  if (!producer) return null;
  const revealYearDebut = revealAll || hintLevel >= 1 || yearDebutRevealed;
  const revealCounts = revealAll || hintLevel >= 2;
  const revealedSongs = producer.representativeSongs.map((song, index) => revealAll || hintLevel >= 3 || (hintLevel >= 2 && index === 3) || (hintLevel >= 1 && index === 4) ? song : '隐藏曲目');
  return {
    id: revealAll ? producer.id : null,
    name: revealAll ? producer.name : '答案 P 主',
    aliases: revealAll ? producer.aliases : [],
    debutDate: revealYearDebut ? producer.debutDate : '',
    debutYear: revealYearDebut ? producer.debutYear : 0,
    debutSong: revealYearDebut ? producer.debutSong : '',
    representativeSongs: revealedSongs,
    hallCount: revealCounts ? producer.hallCount : 0,
    legendCount: revealCounts ? producer.legendCount : 0,
    mythCount: revealCounts ? producer.mythCount : 0,
    famous: revealAll ? producer.famous : true,
  };
}

export function initialProducerState() {
  return {
    producerAnswerId: null,
    usedProducerIds: [],
    producerRound: null,
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
  };
}

export class ProducerMode {
  constructor(session) { this.session = session; }

  get room() { return this.session.room; }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') { await this.startMatch(player, socket); return true; }
    if (message.type === 'submit_producer_guess') { await this.submitGuess(player, message.producerId, socket); return true; }
    return false;
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
    if (!this.room.players.length) return this.session.sendError(socket, '至少需要一名玩家才能开始');
    await this.startRound();
  }

  async startRound() {
    const unused = FAMOUS_PRODUCERS.filter((producer) => !(this.room.usedProducerIds ?? []).includes(producer.id));
    const pool = unused.length ? unused : FAMOUS_PRODUCERS;
    const answer = randomItem(pool);
    const now = Date.now();
    Object.assign(this.room, {
      roundNumber: this.room.roundNumber + 1,
      phase: 'playing',
      producerAnswerId: answer.id,
      usedProducerIds: [...new Set([...(this.room.usedProducerIds ?? []), answer.id])],
      producerRound: { answerId: answer.id },
      startedAt: now,
      endsAt: now + PRODUCER_ROUND_DURATION_MS,
      nextRoundAt: null,
    });
    this.room.players.forEach((item) => Object.assign(item, {
      roundScore: 0,
      producerGuesses: [],
      producerCorrect: false,
      producerYearDebutRevealed: false,
    }));
    await this.session.save();
    this.session.broadcast();
  }

  async submitGuess(player, producerId, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能提交猜测');
    if (Date.now() >= this.room.endsAt) return this.session.sendError(socket, '本轮已经结束');
    if (player.roundScore > 0) return this.session.sendError(socket, '你已经猜出本轮答案');
    const guess = FAMOUS_PRODUCERS.find((producer) => producer.id === producerId);
    if (!guess) return this.session.sendError(socket, 'P 主选择无效');
    if ((player.producerGuesses ?? []).some((entry) => entry.producer.id === guess.id)) return this.session.sendError(socket, '这位 P 主已经猜过了');
    const answer = FAMOUS_PRODUCERS.find((producer) => producer.id === this.room.producerAnswerId);
    const feedback = evaluateProducerGuess(answer, guess);
    const correctCount = this.room.players.filter((item) => item.roundScore > 0).length;
    const points = feedback.isCorrect ? (SCORE_BY_PLACE[correctCount] ?? 0) : 0;
    player.producerGuesses = [{ producer: guess, feedback }, ...(player.producerGuesses ?? [])];
    player.producerYearDebutRevealed = player.producerYearDebutRevealed || guess.debutYear === answer.debutYear;
    if (feedback.isCorrect) {
      player.roundScore = points;
      player.producerCorrect = true;
      player.score += points;
    }
    if (this.room.players.every((item) => item.roundScore > 0)) await this.revealRound();
    else { await this.session.save(); this.session.broadcast(); }
  }

  async revealRound() {
    if (this.room.phase !== 'playing') return;
    this.room.phase = 'round-result';
    this.room.nextRoundAt = Date.now() + PRODUCER_REVEAL_DURATION_MS;
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
    if (this.room.phase === 'playing') {
      times.push(this.room.endsAt);
      HINT_STEPS.forEach(({ afterMs }) => {
        const hintAt = this.room.startedAt + afterMs;
        if (hintAt > Date.now() && hintAt < this.room.endsAt) times.push(hintAt);
      });
    }
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
  }

  project(viewerId) {
    const reveal = ['round-result', 'finished'].includes(this.room.phase);
    const answer = FAMOUS_PRODUCERS.find((producer) => producer.id === this.room.producerAnswerId);
    const hintLevel = reveal ? 3 : this.room.startedAt ? hintLevelAt(this.room.startedAt, Date.now()) : 0;
    const viewer = this.room.players.find((player) => player.id === viewerId);
    const commonPlayer = (player) => ({
      id: player.id, nickname: player.nickname, joinOrder: player.joinOrder, seatIndex: player.seatIndex,
      seat: playerSeatFor(player.seatIndex ?? player.joinOrder), colorId: resolvedPlayerColor(player)?.id ?? null,
      color: resolvedPlayerColor(player), online: player.online, score: player.score, roundScore: player.roundScore,
      solved: player.roundScore > 0, guessCount: player.producerGuesses?.length ?? 0,
      yearDebutRevealed: Boolean(player.producerYearDebutRevealed),
      guesses: player.id === viewerId ? (player.producerGuesses ?? []) : null,
    });
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, mode: PRODUCER_MODE, code: this.room.code,
      phase: this.room.phase, capacity: this.room.capacity, roundCount: this.room.roundCount,
      roundNumber: this.room.roundNumber, hostId: this.room.hostId, poolName: '名 P 主资料库',
      selection: this.room.selection, startedAt: this.room.startedAt, endsAt: this.room.endsAt,
      nextRoundAt: this.room.nextRoundAt,
      hintLevel,
      producerRound: { answer: publicProducer(answer, hintLevel, reveal, viewer?.producerYearDebutRevealed), answerId: reveal ? answer?.id ?? null : null },
      players: this.room.players.map(commonPlayer),
      ranking: this.room.phase === 'finished' ? rankPlayers(this.room.players).map((player) => ({
        id: player.id, nickname: player.nickname, score: player.score, rank: player.rank, seatIndex: player.seatIndex,
        seat: playerSeatFor(player.seatIndex ?? player.joinOrder), colorId: resolvedPlayerColor(player)?.id ?? null,
        color: resolvedPlayerColor(player),
      })) : null,
      serverNow: Date.now(),
    };
  }
}
