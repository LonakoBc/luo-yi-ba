import crypto from 'node:crypto';
import { createCharacterBank, entryCellKeys, generateCrossword } from '../../../web/src/services/crosswordService.js';
import {
  CROSSWORD_ENTRY_COUNT,
  CROSSWORD_MODE,
  CROSSWORD_REVEAL_DURATION_MS,
  CROSSWORD_ROUND_DURATION_MS,
  MULTIPLAYER_PROTOCOL_VERSION,
  crosswordCompletionScore,
  playerSeatFor,
  rankPlayers,
  resolvedPlayerColor,
} from '../../../web/src/services/multiplayerRules.js';
import { selectPool, songsById } from '../catalog.js';

const keyFor = (row, column) => `${row},${column}`;

function random() {
  return crypto.randomInt(1_000_000) / 1_000_000;
}

function publicSong(song) {
  return {
    id: song.id,
    title: song.title,
    releaseMonth: song.releaseMonth,
    staffDisplay: song.staffDisplay,
    singersDisplay: song.singersDisplay,
    lyrics: song.lyrics,
    bilibiliUrl: song.bilibiliUrl,
    vcpediaUrl: song.vcpediaUrl,
  };
}

function publicPuzzle(room, reveal) {
  const puzzle = room.crosswordPuzzle;
  if (!puzzle) return null;
  return {
    width: puzzle.width,
    height: puzzle.height,
    entries: puzzle.entries.map((entry) => ({
      id: entry.id,
      number: entry.number,
      direction: entry.direction,
      row: entry.row,
      column: entry.column,
      length: entry.characters.length,
      song: reveal ? publicSong(entry.song) : null,
    })),
    cells: puzzle.cells.map((cell) => ({
      row: cell.row,
      column: cell.column,
      entryIds: cell.entryIds,
      directions: cell.directions,
      isIntersection: cell.isIntersection,
      isFixed: cell.isFixed,
      character: cell.isFixed || reveal ? cell.character : null,
    })),
    characterBank: room.crosswordCharacterBank,
  };
}

function evaluatePlayer(room, player) {
  const puzzle = room.crosswordPuzzle;
  const values = new Map(puzzle.cells.filter((cell) => cell.isFixed).map((cell) => [keyFor(cell.row, cell.column), cell.character]));
  const tileById = new Map(room.crosswordCharacterBank.map((tile) => [tile.id, tile.character]));
  for (const [key, tileId] of Object.entries(player.crosswordAssignments ?? {})) {
    const character = tileById.get(tileId);
    if (character) values.set(key, character);
  }
  const statuses = {};
  const errors = {};
  let solvedCount = 0;
  let wrongCount = 0;
  for (const entry of puzzle.entries) {
    const keys = entryCellKeys(entry);
    if (!keys.every((key) => values.has(key))) {
      statuses[entry.id] = 'pending';
      errors[entry.id] = [];
      continue;
    }
    const incorrectKeys = keys.filter((key, index) => values.get(key) !== entry.characters[index]);
    if (incorrectKeys.length) {
      statuses[entry.id] = 'wrong';
      errors[entry.id] = incorrectKeys;
      wrongCount += 1;
    } else {
      statuses[entry.id] = 'solved';
      errors[entry.id] = [];
      solvedCount += 1;
    }
  }
  return { statuses, errors, solvedCount, wrongCount };
}

function validAssignments(room, player, assignments) {
  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) return '填写内容无效';
  const cells = new Map(room.crosswordPuzzle.cells.map((cell) => [keyFor(cell.row, cell.column), cell]));
  const tileIds = new Set(room.crosswordCharacterBank.map((tile) => tile.id));
  const used = new Set();
  const current = player.crosswordAssignments ?? {};
  const currentState = evaluatePlayer(room, player);
  for (const [key, tileId] of Object.entries(assignments)) {
    const cell = cells.get(key);
    if (!cell || cell.isFixed) return '不能填写这个格子';
    if (!tileIds.has(tileId) || used.has(tileId)) return '字块内容无效';
    if (cell.entryIds.some((entryId) => currentState.statuses[entryId] === 'solved') && current[key] !== tileId) return '正确曲名已经锁定';
    used.add(tileId);
  }
  return null;
}

export function initialCrosswordState() {
  return {
    crosswordPuzzle: null,
    crosswordCharacterBank: [],
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
  };
}

export class CrosswordMode {
  constructor(session) { this.session = session; }

  get room() { return this.session.room; }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') { await this.startMatch(player, socket); return true; }
    if (message.type === 'update_crossword_assignments') { await this.updateAssignments(player, message.assignments, socket); return true; }
    return false;
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
    if (!this.room.players.length) return this.session.sendError(socket, '至少需要一名玩家才能开始');
    await this.startRound();
  }

  async startRound() {
    const stage = this.room.mode === 'party' ? this.room.stages?.[this.room.partyStageIndex] : null;
    const stagePool = stage?.mode !== CROSSWORD_MODE && stage?.selection ? selectPool(stage.selection) : null;
    const songs = (stagePool?.songs ?? this.room.poolSongIds.map((id) => songsById.get(id))).filter(Boolean);
    let puzzle;
    try { puzzle = generateCrossword(songs, { entryCount: CROSSWORD_ENTRY_COUNT, random }); }
    catch (error) { this.room.phase = 'waiting'; throw error; }
    const now = Date.now();
    Object.assign(this.room, {
      roundNumber: this.room.roundNumber + 1,
      phase: 'playing',
      crosswordPuzzle: puzzle,
      crosswordCharacterBank: createCharacterBank(puzzle, { random }),
      startedAt: now,
      endsAt: now + CROSSWORD_ROUND_DURATION_MS,
      nextRoundAt: null,
    });
    this.room.players.forEach((item) => Object.assign(item, {
      roundScore: 0,
      crosswordAssignments: {},
      crosswordStatuses: {},
      crosswordErrors: {},
      crosswordSolvedCount: 0,
      crosswordWrongCount: 0,
      crosswordAttempts: 0,
    }));
    await this.session.save();
    this.session.broadcast();
  }

  async updateAssignments(player, assignments, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能填写棋盘');
    const error = validAssignments(this.room, player, assignments);
    if (error) return this.session.sendError(socket, error);
    player.crosswordAssignments = { ...assignments };
    const result = evaluatePlayer(this.room, player);
    Object.assign(player, {
      crosswordStatuses: result.statuses,
      crosswordErrors: result.errors,
      crosswordSolvedCount: result.solvedCount,
      crosswordWrongCount: result.wrongCount,
      crosswordAttempts: (player.crosswordAttempts ?? 0) + 1,
    });
    const everyoneSolved = this.room.players.every((item) => item.id === player.id
      ? result.solvedCount >= CROSSWORD_ENTRY_COUNT
      : (item.crosswordSolvedCount ?? 0) >= CROSSWORD_ENTRY_COUNT);
    if (everyoneSolved) await this.revealRound();
    else {
      await this.session.save();
      this.session.broadcast();
    }
  }

  async revealRound() {
    if (this.room.phase !== 'playing') return;
    for (const player of this.room.players) {
      const result = evaluatePlayer(this.room, player);
      Object.assign(player, {
        crosswordStatuses: result.statuses,
        crosswordErrors: result.errors,
        crosswordSolvedCount: result.solvedCount,
        crosswordWrongCount: result.wrongCount,
        crosswordAttempts: player.crosswordAttempts ?? 0,
      });
      player.roundScore = crosswordCompletionScore(result.solvedCount);
      player.score += player.roundScore;
    }
    this.room.phase = 'round-result';
    this.room.nextRoundAt = Date.now() + CROSSWORD_REVEAL_DURATION_MS;
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
    const self = this.room.players.find((player) => player.id === viewerId);
    const commonPlayer = (player) => ({
      id: player.id, nickname: player.nickname, joinOrder: player.joinOrder, seatIndex: player.seatIndex,
      seat: playerSeatFor(player.seatIndex ?? player.joinOrder), colorId: resolvedPlayerColor(player)?.id ?? null,
      color: resolvedPlayerColor(player), online: player.online, score: player.score, roundScore: player.roundScore,
      solvedCount: player.crosswordSolvedCount ?? 0, wrongCount: player.crosswordWrongCount ?? 0,
      attempts: player.crosswordAttempts ?? 0, assignments: player.id === viewerId ? (player.crosswordAssignments ?? {}) : null,
      statuses: player.id === viewerId ? (player.crosswordStatuses ?? {}) : null,
      errors: player.id === viewerId ? (player.crosswordErrors ?? {}) : null,
      solved: (player.crosswordSolvedCount ?? 0) >= CROSSWORD_ENTRY_COUNT,
    });
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, mode: CROSSWORD_MODE, code: this.room.code,
      phase: this.room.phase, capacity: this.room.capacity, roundCount: this.room.roundCount,
      roundNumber: this.room.roundNumber, hostId: this.room.hostId, poolName: this.room.poolName,
      selection: this.room.selection, startedAt: this.room.startedAt, endsAt: this.room.endsAt,
      nextRoundAt: this.room.nextRoundAt, crosswordRound: publicPuzzle(this.room, reveal),
      players: this.room.players.map(commonPlayer),
      ranking: this.room.phase === 'finished' ? rankPlayers(this.room.players).map((player) => ({
        id: player.id, nickname: player.nickname, score: player.score, rank: player.rank, seatIndex: player.seatIndex,
        seat: playerSeatFor(player.seatIndex ?? player.joinOrder), colorId: resolvedPlayerColor(player)?.id ?? null,
        color: resolvedPlayerColor(player),
      })) : null,
      serverNow: Date.now(),
      selfId: self?.id ?? null,
    };
  }
}
