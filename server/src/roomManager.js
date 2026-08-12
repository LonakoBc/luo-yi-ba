import crypto from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import songs from '../../web/src/data/songs.generated.json' with { type: 'json' };
import presets from '../../web/src/data/presets.generated.json' with { type: 'json' };
import { filterSongs, songsForPreset } from '../../web/src/services/libraryService.js';
import {
  HOST_RECONNECT_GRACE_MS, HINT_STEPS, MULTIPLAYER_MODE, MULTIPLAYER_PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET, ROOM_RETENTION_MS, ROUND_DURATION_MS,
  applyGuess, catalogVersionFor, hintLevelAt, projectRoom, roundCompletionState, validateMatchConfig,
} from '../../web/src/services/multiplayerRules.js';

export const catalogVersion = catalogVersionFor(songs);
const songsById = new Map(songs.map((song) => [song.id, song]));

function randomString(length, alphabet = ROOM_CODE_ALPHABET) {
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

export function validNickname(value) {
  const nickname = String(value ?? '').trim();
  return nickname.length >= 1 && [...nickname].length <= 12 ? nickname : null;
}

export function selectPool(selection) {
  if (selection?.kind === 'preset') {
    const preset = presets.find((item) => item.id === selection.presetId);
    return preset ? { songs: songsForPreset(songs, preset), name: preset.name } : null;
  }
  if (selection?.kind === 'custom' && selection.filters) {
    return { songs: filterSongs(songs, selection.filters), name: '自定义曲库' };
  }
  return null;
}

function newPlayer(nickname, joinOrder) {
  return {
    id: crypto.randomUUID(),
    resumeToken: randomString(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
    nickname,
    joinOrder,
    online: false,
    disconnectedAt: Date.now(),
    score: 0,
    roundScore: 0,
    guesses: [],
  };
}

class RoomSession {
  constructor(manager, room) {
    this.manager = manager;
    this.room = room;
    this.sockets = new Map();
    this.timer = null;
    this.queue = Promise.resolve();
  }

  run(task) {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  async save() {
    this.room.updatedAt = Date.now();
    await this.manager.persist(this.room);
    this.schedule();
  }

  async join(input) {
    if (this.room.phase !== 'waiting') throw Object.assign(new Error('游戏已经开始，房间已锁定'), { status: 409 });
    if (this.room.players.length >= this.room.capacity) throw Object.assign(new Error('房间已满'), { status: 409 });
    const nickname = validNickname(input?.nickname);
    if (!nickname) throw Object.assign(new Error('昵称须为 1–12 个字符'), { status: 400 });
    if (this.room.players.some((player) => player.nickname.toLocaleLowerCase('zh-CN') === nickname.toLocaleLowerCase('zh-CN'))) {
      throw Object.assign(new Error('房间内已有相同昵称'), { status: 409 });
    }
    const player = newPlayer(nickname, Math.max(-1, ...this.room.players.map(({ joinOrder }) => joinOrder)) + 1);
    this.room.players.push(player);
    await this.save();
    this.broadcast();
    return { code: this.room.code, playerId: player.id, resumeToken: player.resumeToken };
  }

  async connect(token, socket) {
    const player = this.room.players.find((item) => item.resumeToken === token);
    if (!player) throw Object.assign(new Error('恢复凭据无效'), { status: 401 });
    this.sockets.set(socket, player.id);
    player.online = true;
    player.disconnectedAt = null;
    if (!this.room.hostId && this.room.phase === 'waiting') this.transferHost();
    this.room.allOfflineAt = null;
    await this.save();
    this.broadcast();
    return player.id;
  }

  playerForToken(token) {
    return this.room.players.find((item) => item.resumeToken === token) ?? null;
  }

  async disconnect(socket) {
    const playerId = this.sockets.get(socket);
    this.sockets.delete(socket);
    const player = this.room.players.find((item) => item.id === playerId);
    if (!player) return;
    player.online = [...this.sockets.values()].includes(playerId);
    if (!player.online) player.disconnectedAt = Date.now();
    if (this.room.players.every((item) => !item.online)) this.room.allOfflineAt = Date.now();
    await this.save();
    this.broadcast();
  }

  async command(socket, message) {
    const playerId = this.sockets.get(socket);
    const player = this.room.players.find((item) => item.id === playerId);
    if (!player) return;
    if (message.type === 'sync') return this.sendState(socket, playerId);
    if (message.type === 'start_match') return this.startMatch(player, socket);
    if (message.type === 'submit_guess') return this.submitGuess(player, message.songId, socket);
    if (message.type === 'leave_room') return this.leave(player);
    this.sendError(socket, '未知命令');
  }

  async leave(player) {
    if (this.room.phase === 'waiting') {
      this.room.players = this.room.players.filter((item) => item.id !== player.id);
      if (this.room.hostId === player.id) this.transferHost();
    } else {
      player.online = false;
      player.disconnectedAt = Date.now();
    }
    await this.save();
    this.broadcast();
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.sendError(socket, '游戏已经开始');
    if (this.room.players.length !== this.room.capacity) return this.sendError(socket, '等待玩家坐满后才能开始');
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
    await this.save();
    this.broadcast();
  }

  async submitGuess(player, songId, socket) {
    if (this.room.phase !== 'playing') return this.sendError(socket, '当前不能提交猜测');
    const song = songsById.get(songId);
    if (!song || !this.room.poolSongIds.includes(songId)) return this.sendError(socket, '歌曲不在当前曲库中');
    const receivedAt = Date.now();
    const correctCount = this.room.players.filter((item) => item.roundScore > 0).length;
    const result = applyGuess({ player, song, answer: this.room.answer, receivedAt, endsAt: this.room.endsAt, correctCount });
    if (result.error) return this.sendError(socket, result.error);
    player.guesses.push({ song, feedback: result.feedback, receivedAt });
    if (result.points) { player.roundScore = result.points; player.score += result.points; }
    if (this.room.players.every((item) => item.roundScore > 0)) await this.finishRound();
    else { await this.save(); this.broadcast(); }
  }

  async finishRound() {
    if (this.room.phase !== 'playing') return;
    Object.assign(this.room, roundCompletionState(this.room.roundNumber, this.room.roundCount, Date.now()));
    await this.save();
    this.broadcast();
  }

  transferHost() {
    const next = [...this.room.players].filter((player) => player.online).sort((a, b) => a.joinOrder - b.joinOrder)[0];
    this.room.hostId = next?.id ?? null;
  }

  async tick() {
    const now = Date.now();
    for (const player of [...this.room.players]) {
      if (!player.online && player.disconnectedAt && now - player.disconnectedAt >= HOST_RECONNECT_GRACE_MS) {
        const wasHost = player.id === this.room.hostId;
        if (this.room.phase === 'waiting') this.room.players = this.room.players.filter((item) => item.id !== player.id);
        if (wasHost) this.transferHost();
      }
    }
    if (this.room.players.length === 0) this.room.allOfflineAt ??= now;
    if (this.room.phase === 'playing') {
      if (now >= this.room.endsAt) await this.finishRound();
      else this.room.hintLevel = hintLevelAt(this.room.startedAt, now);
    } else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
      await this.startRound();
    }
    if (this.room.allOfflineAt && now - this.room.allOfflineAt >= ROOM_RETENTION_MS) {
      await this.manager.delete(this.room.code);
      return;
    }
    await this.save();
    this.broadcast();
  }

  schedule() {
    clearTimeout(this.timer);
    const now = Date.now();
    const times = [];
    if (this.room.phase === 'playing') {
      for (const step of HINT_STEPS) times.push(this.room.startedAt + step.afterMs);
      times.push(this.room.endsAt);
    }
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
    for (const player of this.room.players) if (!player.online && player.disconnectedAt) times.push(player.disconnectedAt + HOST_RECONNECT_GRACE_MS);
    if (this.room.allOfflineAt) times.push(this.room.allOfflineAt + ROOM_RETENTION_MS);
    const next = times.filter((time) => time > now).sort((a, b) => a - b)[0];
    if (!next) return;
    this.timer = setTimeout(() => this.run(() => this.tick()).catch((error) => this.manager.onError(error)), Math.max(0, next - now));
    this.timer.unref();
  }

  sendState(socket, playerId) {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'state', room: projectRoom(this.room, playerId) }));
  }

  sendError(socket, error) {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'error', error }));
  }

  broadcast() {
    for (const [socket, playerId] of this.sockets) {
      try { this.sendState(socket, playerId); } catch { /* disconnected socket */ }
    }
  }
}

export class RoomManager {
  constructor({ dataDirectory, onError = console.error } = {}) {
    this.dataDirectory = dataDirectory ?? path.resolve('data/rooms');
    this.onError = onError;
    this.rooms = new Map();
  }

  async initialize() {
    await mkdir(this.dataDirectory, { recursive: true });
    for (const filename of await readdir(this.dataDirectory)) {
      if (!filename.endsWith('.json')) continue;
      try {
        const room = JSON.parse(await readFile(path.join(this.dataDirectory, filename), 'utf8'));
        const now = Date.now();
        room.players.forEach((player) => { player.online = false; player.disconnectedAt ??= now; });
        room.allOfflineAt ??= now;
        const session = new RoomSession(this, room);
        this.rooms.set(room.code, session);
        await session.run(() => session.tick());
      } catch (error) { this.onError(error); }
    }
  }

  get(code) { return this.rooms.get(code); }

  async create(input) {
    const player = newPlayer(input.nickname, 0);
    let code;
    do code = randomString(6); while (this.rooms.has(code));
    const now = Date.now();
    const room = {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      mode: MULTIPLAYER_MODE,
      code,
      phase: 'waiting',
      capacity: input.capacity,
      roundCount: input.roundCount,
      roundNumber: 0,
      hostId: player.id,
      selection: input.selection,
      poolName: input.poolName,
      poolSongIds: input.poolSongIds,
      usedSongIds: [],
      players: [player],
      answerId: null,
      answer: null,
      startedAt: null,
      endsAt: null,
      nextRoundAt: null,
      hintLevel: 0,
      createdAt: now,
      updatedAt: now,
      allOfflineAt: null,
    };
    const session = new RoomSession(this, room);
    this.rooms.set(code, session);
    await session.save();
    return { code, playerId: player.id, resumeToken: player.resumeToken };
  }

  async persist(room) {
    const target = path.join(this.dataDirectory, `${room.code}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(room), { mode: 0o600 });
    await rename(temporary, target);
  }

  async delete(code) {
    const session = this.rooms.get(code);
    if (session) clearTimeout(session.timer);
    this.rooms.delete(code);
    await rm(path.join(this.dataDirectory, `${code}.json`), { force: true });
  }

  validateCreate(body) {
    const nickname = validNickname(body?.nickname);
    const pool = selectPool(body?.selection);
    const error = !nickname ? '昵称须为 1–12 个字符'
      : body?.catalogVersion !== catalogVersion ? '题库版本已更新，请刷新页面'
        : !pool ? '曲库配置无效'
          : validateMatchConfig({ capacity: body.capacity, roundCount: body.roundCount, songCount: pool.songs.length });
    if (error) throw Object.assign(new Error(error), { status: 400 });
    return { nickname, capacity: body.capacity, roundCount: body.roundCount, selection: body.selection, poolName: pool.name, poolSongIds: pool.songs.map(({ id }) => id) };
  }
}
