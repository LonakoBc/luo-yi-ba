import crypto from 'node:crypto';
import { selectPool, songsById } from '../catalog.js';
import { GuessSongMode } from './guessSongMode.js';
import { SeniorityMode } from './seniorityMode.js';
import { SortingMode } from './sortingMode.js';
import { CrosswordMode } from './crosswordMode.js';
import { ProducerMode } from './producerMode.js';
import { MusicGuessMode } from './musicGuessMode.js';
import {
  CROSSWORD_MODE,
  GUESS_SONG_MODE,
  HINT_STEPS,
  MULTIPLAYER_PROTOCOL_VERSION,
  PARTY_MODE,
  MUSIC_GUESS_MODE,
  PRODUCER_MODE,
  ROUND_DURATION_MS,
  SENIORITY_MODE,
  SENIORITY_ROUND_DURATION_MS,
  SORTING_MODE,
  SORTING_ROUND_DURATION_MS,
  SORTING_SONGS_PER_ROUND,
  TRIATHLON_MODE,
  TRIATHLON_STAGE_ROUNDS,
  TRIATHLON_TOTAL_ROUNDS,
  hintLevelAt,
  projectRoom,
} from '../../../web/src/services/multiplayerRules.js';

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = crypto.randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function validDatedSong(song) {
  return /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song?.releaseMonth);
}

function rememberSongs(room, ids) {
  room.usedSongIds = [...new Set([...(room.usedSongIds ?? []), ...ids])];
}

function pickGuessSong(room) {
  const unused = room.poolSongIds.filter((id) => !room.usedSongIds.includes(id));
  const candidates = unused.length ? unused : room.poolSongIds;
  return candidates[crypto.randomInt(candidates.length)];
}

function pickSortingRound(room) {
  const songs = room.poolSongIds.map((id) => songsById.get(id)).filter(validDatedSong);
  const buckets = new Map();
  for (const song of shuffle(songs)) {
    const bucket = buckets.get(song.releaseMonth) ?? [];
    bucket.push(song);
    buckets.set(song.releaseMonth, bucket);
  }
  const dates = shuffle([...buckets.keys()]).sort((left, right) => {
    const leftUnused = buckets.get(left).some(({ id }) => !room.usedSongIds.includes(id));
    const rightUnused = buckets.get(right).some(({ id }) => !room.usedSongIds.includes(id));
    return Number(rightUnused) - Number(leftUnused);
  }).slice(0, SORTING_SONGS_PER_ROUND);
  if (dates.length < SORTING_SONGS_PER_ROUND) throw new Error('当前曲库无法生成五首歌的时间线');
  const selected = dates.map((date) => {
    const bucket = buckets.get(date);
    const unused = bucket.filter(({ id }) => !room.usedSongIds.includes(id));
    const candidates = unused.length ? unused : bucket;
    return candidates[crypto.randomInt(candidates.length)];
  });
  const answerIds = [...selected].sort((left, right) => left.releaseMonth.localeCompare(right.releaseMonth)).map(({ id }) => id);
  let initialOrderIds = shuffle(selected).map(({ id }) => id);
  if (initialOrderIds.every((id, index) => id === answerIds[index])) initialOrderIds = [...initialOrderIds.slice(1), initialOrderIds[0]];
  return { initialOrderIds, answerIds };
}

function seniorityDifficulty(stageRound) {
  return stageRound < 3
    ? { label: '年代进阶', minYears: 1, maxYears: 2 }
    : { label: '资历决胜', minYears: 0, maxYears: 1 };
}

function pairPenalty(left, right, difficulty) {
  const difference = Math.abs(Number(left.releaseMonth.slice(0, 4)) - Number(right.releaseMonth.slice(0, 4)));
  if (difference < difficulty.minYears) return difficulty.minYears - difference;
  if (difference > difficulty.maxYears) return difference - difficulty.maxYears;
  return 0;
}

function pickSeniorityPair(room, stageRound) {
  const songs = room.poolSongIds.map((id) => songsById.get(id)).filter(validDatedSong);
  const difficulty = seniorityDifficulty(stageRound);
  let candidates = [];
  let bestReuse = Infinity;
  let bestPenalty = Infinity;
  for (let leftIndex = 0; leftIndex < songs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < songs.length; rightIndex += 1) {
      const left = songs[leftIndex];
      const right = songs[rightIndex];
      if (left.releaseMonth === right.releaseMonth) continue;
      const reuse = Number(room.usedSongIds.includes(left.id)) + Number(room.usedSongIds.includes(right.id));
      const penalty = pairPenalty(left, right, difficulty);
      if (penalty < bestPenalty || (penalty === bestPenalty && reuse < bestReuse)) {
        candidates = [{ left, right }];
        bestReuse = reuse;
        bestPenalty = penalty;
      } else if (penalty === bestPenalty && reuse === bestReuse) candidates.push({ left, right });
    }
  }
  if (!candidates.length) throw new Error('当前曲库无法生成老资历题目');
  const pair = candidates[crypto.randomInt(candidates.length)];
  const [left, right] = crypto.randomInt(2) ? [pair.left, pair.right] : [pair.right, pair.left];
  return { leftId: left.id, rightId: right.id, correctId: left.releaseMonth < right.releaseMonth ? left.id : right.id, difficulty };
}

export function initialTriathlonState() {
  return {
    stages: [],
    partyStageIndex: 0,
    partyRoundNumber: 0,
    activeMode: null,
    triathlonStageRound: 0,
    usedSongIds: [],
    answerId: null,
    answer: null,
    hintLevel: 0,
    sortingRound: null,
    seniorityPair: null,
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
  };
}

export class TriathlonMode {
  constructor(session) {
    this.session = session;
    this.guess = new GuessSongMode(session);
    this.sorting = new SortingMode(session);
    this.seniority = new SeniorityMode(session);
    this.crossword = new CrosswordMode(session);
    this.producer = new ProducerMode(session);
    this.musicGuess = new MusicGuessMode(session);
  }

  get room() { return this.session.room; }

  get party() { return this.room.mode === PARTY_MODE; }

  stageDefinitions() {
    return this.party ? this.room.stages : [
      { mode: GUESS_SONG_MODE, roundCount: TRIATHLON_STAGE_ROUNDS },
      { mode: SORTING_MODE, roundCount: TRIATHLON_STAGE_ROUNDS },
      { mode: SENIORITY_MODE, roundCount: TRIATHLON_STAGE_ROUNDS },
    ];
  }

  stageForRound(overallRound) {
    let offset = 0;
    for (let index = 0; index < this.stageDefinitions().length; index += 1) {
      const stage = this.stageDefinitions()[index];
      if (overallRound <= offset + stage.roundCount) return { ...stage, index, stageRound: overallRound - offset };
      offset += stage.roundCount;
    }
    return null;
  }

  totalPartyRounds() {
    return this.stageDefinitions().reduce((total, stage) => total + stage.roundCount, 0);
  }

  handlerFor(mode) {
    return mode === GUESS_SONG_MODE ? this.guess
      : mode === SORTING_MODE ? this.sorting
        : mode === SENIORITY_MODE ? this.seniority
          : mode === CROSSWORD_MODE ? this.crossword
            : mode === PRODUCER_MODE ? this.producer
              : this.musicGuess;
  }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') {
      if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
      if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
      if (!this.room.players.length) return this.session.sendError(socket, '至少需要一名玩家才能开始');
      if (!this.party && this.room.players.length !== this.room.capacity) return this.session.sendError(socket, '等待玩家坐满后才能开始');
      if (this.party) await this.startPartyRound();
      else await this.startNextRound();
      return true;
    }
    if (this.party && this.room.activeMode === GUESS_SONG_MODE && message.type === 'submit_guess') {
      await this.guess.submitGuess(player, message.songId, socket);
      return true;
    }
    if (this.party && this.room.activeMode === SORTING_MODE && message.type === 'update_sorting_order') {
      await this.sorting.updateOrder(player, message.orderIds, socket);
      return true;
    }
    if (this.party && this.room.activeMode === SORTING_MODE && message.type === 'submit_sorting_order') {
      await this.sorting.submitOrder(player, message.orderIds, socket);
      return true;
    }
    if (this.party && this.room.activeMode === SENIORITY_MODE && message.type === 'submit_seniority_choice') {
      await this.seniority.submitChoice(player, message.songId, socket);
      return true;
    }
    if (this.party && this.room.activeMode === CROSSWORD_MODE && message.type === 'update_crossword_assignments') {
      await this.crossword.updateAssignments(player, message.assignments, socket);
      return true;
    }
    if (this.party && this.room.activeMode === PRODUCER_MODE && message.type === 'submit_producer_guess') {
      await this.producer.submitGuess(player, message.producerId, socket);
      return true;
    }
    if (this.party && this.room.activeMode === MUSIC_GUESS_MODE && message.type === 'submit_music_guess') {
      await this.musicGuess.submitGuess(player, message.trackId, socket);
      return true;
    }
    if (this.room.activeMode === GUESS_SONG_MODE && message.type === 'submit_guess') {
      await this.guess.submitGuess(player, message.songId, socket);
      return true;
    }
    if (this.room.activeMode === SORTING_MODE && message.type === 'update_sorting_order') {
      await this.sorting.updateOrder(player, message.orderIds, socket);
      return true;
    }
    if (this.room.activeMode === SORTING_MODE && message.type === 'submit_sorting_order') {
      await this.sorting.submitOrder(player, message.orderIds, socket);
      return true;
    }
    if (this.room.activeMode === SENIORITY_MODE && message.type === 'submit_seniority_choice') {
      await this.seniority.submitChoice(player, message.songId, socket);
      return true;
    }
    return false;
  }

  async startPartyRound() {
    const overallRound = (this.room.partyRoundNumber ?? 0) + 1;
    const stage = this.stageForRound(overallRound);
    if (!stage) return this.finishMatch();
    const now = Date.now();
    Object.assign(this.room, {
      partyRoundNumber: overallRound,
      partyStageIndex: stage.index,
      activeMode: stage.mode,
      roundNumber: stage.stageRound - 1,
      roundCount: stage.roundCount,
      phase: 'waiting',
      startedAt: null,
      nextRoundAt: null,
    });
    await this.handlerFor(stage.mode).startRound();
  }

  async startNextRound() {
    if (this.party) return this.startPartyRound();
    const overallRound = this.room.roundNumber + 1;
    const stageRound = ((overallRound - 1) % TRIATHLON_STAGE_ROUNDS) + 1;
    const activeMode = overallRound <= 3 ? GUESS_SONG_MODE : overallRound <= 6 ? SORTING_MODE : SENIORITY_MODE;
    const now = Date.now();
    Object.assign(this.room, { roundNumber: overallRound, triathlonStageRound: stageRound, activeMode, phase: 'playing', startedAt: now, nextRoundAt: null });
    if (activeMode === GUESS_SONG_MODE) {
      const answerId = pickGuessSong(this.room);
      Object.assign(this.room, { answerId, answer: songsById.get(answerId), hintLevel: 0, endsAt: now + ROUND_DURATION_MS });
      rememberSongs(this.room, [answerId]);
      this.room.players.forEach((player) => { player.roundScore = 0; player.guesses = []; });
    } else if (activeMode === SORTING_MODE) {
      const round = pickSortingRound(this.room);
      Object.assign(this.room, { sortingRound: round, endsAt: now + SORTING_ROUND_DURATION_MS });
      rememberSongs(this.room, round.initialOrderIds);
      this.room.players.forEach((player) => Object.assign(player, {
        roundScore: 0, sortingOrderIds: [...round.initialOrderIds], sortingMoveCount: 0, sortingSubmittedAt: null,
        sortingSubmitted: false, sortingCorrectPairs: null, sortingTotalPairs: null, sortingPercentage: null, sortingRoundRank: null,
      }));
    } else {
      const pair = pickSeniorityPair(this.room, stageRound);
      Object.assign(this.room, { seniorityPair: pair, endsAt: now + SENIORITY_ROUND_DURATION_MS });
      rememberSongs(this.room, [pair.leftId, pair.rightId]);
      this.room.players.forEach((player) => Object.assign(player, {
        roundScore: 0, roundChoiceId: null, roundAnsweredAt: null, roundCorrect: null,
      }));
    }
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
    if (this.party) {
      const handler = this.handlerFor(this.room.activeMode);
      if (this.room.phase === 'playing') {
        if (now >= this.room.endsAt) {
          if (this.room.activeMode === GUESS_SONG_MODE) {
            const previous = this.room.roundCount;
            this.room.roundCount = this.room.roundNumber + 1;
            await this.guess.finishRound();
            this.room.roundCount = previous;
          } else if (this.room.activeMode === SORTING_MODE || this.room.activeMode === SENIORITY_MODE
            || this.room.activeMode === CROSSWORD_MODE || this.room.activeMode === PRODUCER_MODE || this.room.activeMode === MUSIC_GUESS_MODE) {
            await handler.revealRound();
          }
        } else if (this.room.activeMode === GUESS_SONG_MODE) {
          this.room.hintLevel = hintLevelAt(this.room.startedAt, now);
        }
      } else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
        if (this.room.partyRoundNumber >= this.totalPartyRounds()) await this.finishMatch();
        else await this.startPartyRound();
      }
      return;
    }
    if (this.room.phase === 'playing') {
      if (this.room.activeMode === GUESS_SONG_MODE) {
        if (now >= this.room.endsAt) await this.guess.finishRound();
        else this.room.hintLevel = hintLevelAt(this.room.startedAt, now);
      } else if (this.room.activeMode === SORTING_MODE && now >= this.room.endsAt) await this.sorting.revealRound();
      else if (this.room.activeMode === SENIORITY_MODE && now >= this.room.endsAt) await this.seniority.revealRound();
    } else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
      if (this.room.roundNumber >= TRIATHLON_TOTAL_ROUNDS) await this.finishMatch();
      else await this.startNextRound();
    }
  }

  addScheduleTimes(times) {
    if (this.party) {
      if (this.room.phase === 'playing') {
        if (this.room.activeMode === GUESS_SONG_MODE) for (const step of HINT_STEPS) times.push(this.room.startedAt + step.afterMs);
        times.push(this.room.endsAt);
      }
      if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
      return;
    }
    if (this.room.phase === 'playing') {
      if (this.room.activeMode === GUESS_SONG_MODE) for (const step of HINT_STEPS) times.push(this.room.startedAt + step.afterMs);
      times.push(this.room.endsAt);
    }
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
  }

  project(viewerId) {
    if (this.party) {
      const projection = this.handlerFor(this.room.activeMode).project(viewerId);
      const stage = this.stageDefinitions()[this.room.partyStageIndex];
      const stagePool = stage?.selection?.kind === 'preset' ? selectPool(stage.selection) : null;
      return {
        ...projection,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        mode: PARTY_MODE,
        activeMode: this.room.activeMode,
        stages: this.room.stages,
        partyStageIndex: this.room.partyStageIndex,
        roundNumber: this.room.roundNumber,
        roundCount: this.room.roundCount,
        overallRoundNumber: this.room.partyRoundNumber,
        overallRoundCount: this.totalPartyRounds(),
        poolName: stagePool?.name ?? (stage?.selection?.kind === 'music-playlists' ? '听歌识曲独立歌单' : projection.poolName),
        selection: stage?.selection ?? projection.selection,
        nextLabel: this.room.partyRoundNumber >= this.totalPartyRounds() ? '结算' : this.room.roundNumber >= stage.roundCount ? '下一玩法' : '下一轮',
      };
    }
    let projection;
    if (this.room.activeMode === SORTING_MODE) projection = this.sorting.project(viewerId);
    else if (this.room.activeMode === SENIORITY_MODE) projection = this.seniority.project(viewerId);
    else projection = projectRoom(this.room, viewerId);
    const stageRound = this.room.triathlonStageRound || 0;
    const nextLabel = this.room.roundNumber >= TRIATHLON_TOTAL_ROUNDS ? '结算' : stageRound >= TRIATHLON_STAGE_ROUNDS ? '下一项目' : '下一轮';
    return {
      ...projection,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      mode: TRIATHLON_MODE,
      activeMode: this.room.activeMode,
      roundNumber: stageRound,
      roundCount: TRIATHLON_STAGE_ROUNDS,
      overallRoundNumber: this.room.roundNumber,
      overallRoundCount: TRIATHLON_TOTAL_ROUNDS,
      nextLabel,
    };
  }
}
