import crypto from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_PLAYER_COLOR_IDS, GUESS_SONG_MODE, HOST_RECONNECT_GRACE_MS, MULTIPLAYER_MODE, MULTIPLAYER_PROTOCOL_VERSION,
  PARTY_MODE, SENIORITY_MODE, SORTING_MODE, TRIATHLON_MODE, CROSSWORD_MODE, CROSSWORD_ENTRY_COUNT, CROSSWORD_LIBRARY_PRESET_IDS, MUSIC_GUESS_MODE,
  PLAYER_COLORS, ROOM_CODE_ALPHABET, ROOM_RETENTION_MS, playerColorFor, resolvedPlayerColor, validateMatchConfig,
  minimumSongsForMode, partyStageTotalRounds, validatePartyStages,
} from '../../web/src/services/multiplayerRules.js';
import { catalogVersion, selectPool } from './catalog.js';
import { createModeHandler, initialModeState, supportsMode } from './modes/index.js';
import { isMultiplayerEmoteId, MULTIPLAYER_EMOTE_COOLDOWN_MS } from '../../web/src/services/multiplayerEmotes.js';

export { catalogVersion } from './catalog.js';

const MUSIC_GUESS_PRESET_IDS = new Set(['vsinger', 'five-dimension', 'wangchuan', 'all']);

function randomString(length, alphabet = ROOM_CODE_ALPHABET) {
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

export function validNickname(value) {
  const nickname = String(value ?? '').trim();
  return nickname.length >= 1 && [...nickname].length <= 12 ? nickname : null;
}

function availableColorId(players, preferredColorId) {
  const usedColors = new Set(players.map((player) => resolvedPlayerColor(player)?.color.toUpperCase()).filter(Boolean));
  const preferred = playerColorFor(preferredColorId);
  return [preferred, ...PLAYER_COLORS].find((entry, index, choices) => entry
    && choices.indexOf(entry) === index && !usedColors.has(entry.color.toUpperCase()))?.id ?? null;
}

function newPlayer(nickname, joinOrder, seatIndex, colorId) {
  return {
    id: crypto.randomUUID(),
    resumeToken: randomString(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
    nickname,
    joinOrder,
    seatIndex,
    colorId,
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
    this.emoteSentAt = new Map();
    this.timer = null;
    this.queue = Promise.resolve();
    this.modeHandler = createModeHandler(room.mode, this);
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
    const seatIndex = Array.from({ length: this.room.capacity }, (_, index) => index)
      .find((index) => !this.room.players.some((item) => item.seatIndex === index));
    const colorId = availableColorId(this.room.players, DEFAULT_PLAYER_COLOR_IDS[seatIndex]);
    const player = newPlayer(nickname, Math.max(-1, ...this.room.players.map(({ joinOrder }) => joinOrder)) + 1, seatIndex, colorId);
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
    // A reconnect/sync is also a watchdog for an overdue room timer. This keeps
    // a match recoverable if the process was suspended or a platform timer was
    // delayed while a round crossed its deadline.
    if (message.type === 'sync') {
      await this.tick();
      return;
    }
    if (message.type === 'leave_room') return this.leave(player);
    if (message.type === 'select_color') return this.selectColor(player, message.colorId, socket);
    if (message.type === 'send_emote') return this.sendEmote(player, message.emoteId, socket);
    if (message.type === 'update_room_config') return this.updateRoomConfig(player, message.config, socket);
    if (await this.modeHandler.handleCommand(player, message, socket)) return;
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

  async selectColor(player, colorId, socket) {
    if (this.room.phase !== 'waiting') return this.sendError(socket, '游戏开始后不能更换颜色');
    const color = playerColorFor(colorId);
    if (!color) return this.sendError(socket, '玩家颜色无效');
    const occupied = this.room.players.some((item) => item.id !== player.id
      && resolvedPlayerColor(item)?.color.toUpperCase() === color.color.toUpperCase());
    if (occupied) return this.sendError(socket, '这个颜色已经被其他玩家选择');
    player.colorId = color.id;
    await this.save();
    this.broadcast();
  }

  async updateRoomConfig(player, config, socket) {
    if (player.id !== this.room.hostId) return this.sendError(socket, '只有房主可以调整房间规则');
    if (this.room.phase !== 'waiting') return this.sendError(socket, '游戏开始后不能调整房间规则');
    let next;
    try {
      next = this.manager.validateCreate({ ...config, catalogVersion });
    } catch (error) {
      return this.sendError(socket, error.message);
    }
    const preserved = {
      protocolVersion: this.room.protocolVersion,
      code: this.room.code,
      phase: 'waiting',
      hostId: this.room.hostId,
      players: this.room.players,
      createdAt: this.room.createdAt,
      updatedAt: this.room.updatedAt,
      allOfflineAt: this.room.allOfflineAt,
    };
    Object.assign(this.room, initialModeState(next.mode), next, preserved);
    this.modeHandler = createModeHandler(next.mode, this);
    await this.save();
    this.broadcast();
  }

  sendEmote(player, emoteId, socket) {
    if (!isMultiplayerEmoteId(emoteId)) return this.sendError(socket, '表情无效');
    const sentAt = Date.now();
    const previousSentAt = this.emoteSentAt.get(player.id) ?? 0;
    if (sentAt - previousSentAt < MULTIPLAYER_EMOTE_COOLDOWN_MS) return this.sendError(socket, '表情发送太快了');
    this.emoteSentAt.set(player.id, sentAt);
    this.broadcastMessage({ type: 'emote', playerId: player.id, emoteId, sentAt });
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
    await this.modeHandler.tick(now);
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
    this.modeHandler.addScheduleTimes(times);
    for (const player of this.room.players) if (!player.online && player.disconnectedAt) times.push(player.disconnectedAt + HOST_RECONNECT_GRACE_MS);
    if (this.room.allOfflineAt) times.push(this.room.allOfflineAt + ROOM_RETENTION_MS);
    const next = times.filter((time) => time > now).sort((a, b) => a - b)[0];
    if (!next) return;
    this.timer = setTimeout(() => this.run(() => this.tick()).catch((error) => this.manager.onError(error)), Math.max(0, next - now));
    this.timer.unref();
  }

  sendState(socket, playerId) {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'state', room: this.modeHandler.project(playerId) }));
  }

  sendError(socket, error) {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'error', error }));
  }

  broadcastMessage(message) {
    const serialized = JSON.stringify(message);
    for (const socket of this.sockets.keys()) {
      if (socket.readyState === 1) socket.send(serialized);
    }
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
        room.mode ??= MULTIPLAYER_MODE;
        const usedSeats = new Set();
        const usedColors = new Set();
        [...room.players].sort((a, b) => a.joinOrder - b.joinOrder).forEach((player) => {
          const currentSeat = Number.isInteger(player.seatIndex) && player.seatIndex >= 0 && player.seatIndex < room.capacity && !usedSeats.has(player.seatIndex)
            ? player.seatIndex
            : Array.from({ length: room.capacity }, (_, index) => index).find((index) => !usedSeats.has(index));
          player.seatIndex = currentSeat;
          usedSeats.add(currentSeat);
          const selectedColor = playerColorFor(player.colorId);
          const fallbackColor = [playerColorFor(DEFAULT_PLAYER_COLOR_IDS[currentSeat]), ...PLAYER_COLORS]
            .find((entry) => entry && !usedColors.has(entry.color.toUpperCase()));
          player.colorId = selectedColor && !usedColors.has(selectedColor.color.toUpperCase()) ? selectedColor.id : fallbackColor?.id ?? null;
          const resolvedColor = resolvedPlayerColor(player);
          if (resolvedColor) usedColors.add(resolvedColor.color.toUpperCase());
          player.online = false;
          player.disconnectedAt ??= now;
        });
        room.allOfflineAt ??= now;
        const session = new RoomSession(this, room);
        this.rooms.set(room.code, session);
        await session.run(() => session.tick());
      } catch (error) { this.onError(error); }
    }
  }

  get(code) { return this.rooms.get(code); }

  async create(input) {
    const player = newPlayer(input.nickname, 0, 0, DEFAULT_PLAYER_COLOR_IDS[0]);
    let code;
    do code = randomString(6); while (this.rooms.has(code));
    const now = Date.now();
    const room = {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      mode: input.mode,
      code,
      phase: 'waiting',
      capacity: input.capacity,
      roundCount: input.roundCount,
      roundNumber: 0,
      hostId: player.id,
      selection: input.selection,
      poolName: input.poolName,
      poolSongIds: input.poolSongIds,
      players: [player],
      ...initialModeState(input.mode),
      stages: input.stages,
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
    const mode = body?.mode ?? GUESS_SONG_MODE;
    const stages = mode === PARTY_MODE ? body?.stages : null;
    const pool = selectPool(body?.selection);
    const partyError = mode === PARTY_MODE ? validatePartyStages(stages) : null;
    const partyStages = stages ?? [];
    // A party's main selection belongs to the shared song modes. Crossword
    // keeps its own stage selection and must not validate against this pool.
    const crosswordSelectionValid = mode !== CROSSWORD_MODE
      || (body?.selection?.kind === 'preset' && CROSSWORD_LIBRARY_PRESET_IDS.includes(body.selection.presetId));
    const partyStageSelectionError = mode !== PARTY_MODE ? null : partyStages.map((stage) => {
      if (!stage.selection) return null;
      if (stage.mode === CROSSWORD_MODE) {
        if (stage.selection.kind !== 'preset' || !CROSSWORD_LIBRARY_PRESET_IDS.includes(stage.selection.presetId)) return '派对中的曲名填字仅支持全曲库、禾念系和五维介质系';
        const stagePool = selectPool(stage.selection);
        return !stagePool || stagePool.songs.length < CROSSWORD_ENTRY_COUNT ? '派对中的曲名填字曲库至少需要六首歌曲' : null;
      }
      if (stage.mode === MUSIC_GUESS_MODE) {
        const playlistIds = stage.selection.musicPlaylistIds;
        if (stage.selection.kind !== 'music-playlists' || !Array.isArray(playlistIds) || !playlistIds.length) return '派对中的听歌识曲至少需要选择一个本地歌单';
        if (playlistIds.some((id) => MUSIC_GUESS_PRESET_IDS.has(id)) && playlistIds.length > 1) return '听歌识曲预设曲库不能和歌姬曲库组合';
      }
      return null;
    }).find(Boolean) ?? null;
    const partyNeedsDates = mode === PARTY_MODE && partyStages.some(({ mode: stageMode }) => [SENIORITY_MODE, SORTING_MODE].includes(stageMode));
    const modeSongs = [SENIORITY_MODE, SORTING_MODE, TRIATHLON_MODE].includes(mode)
      ? pool?.songs.filter((song) => /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth))
      : partyNeedsDates ? pool?.songs.filter((song) => /^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth))
      : pool?.songs;
    const partySortingRounds = mode === PARTY_MODE ? partyStages.filter(({ mode: stageMode }) => stageMode === SORTING_MODE).reduce((total, stage) => total + stage.roundCount, 0) : 0;
    const hasComparableDates = mode === SENIORITY_MODE
      ? new Set(modeSongs?.map(({ releaseMonth }) => releaseMonth)).size >= 2
      : !partyNeedsDates || new Set(modeSongs?.map(({ releaseMonth }) => releaseMonth)).size >= 2;
    const sortingDateCounts = mode === SORTING_MODE ? [...(modeSongs ?? []).reduce((counts, song) => counts.set(song.releaseMonth, (counts.get(song.releaseMonth) ?? 0) + 1), new Map()).values()] : [];
    const sortableSongCapacity = sortingDateCounts.reduce((total, count) => total + Math.min(count, body?.roundCount ?? 0), 0);
    const partySortableSongCapacity = mode === PARTY_MODE
      ? [...(modeSongs ?? []).reduce((counts, song) => counts.set(song.releaseMonth, (counts.get(song.releaseMonth) ?? 0) + 1), new Map()).values()]
        .reduce((total, count) => total + Math.min(count, partySortingRounds), 0)
      : 0;
    const hasSortableDates = mode === SORTING_MODE
      ? sortableSongCapacity >= body.roundCount * 5
      : mode !== PARTY_MODE || partySortingRounds === 0 || partySortableSongCapacity >= partySortingRounds * 5;
    const hasTriathlonDates = mode !== TRIATHLON_MODE || new Set(modeSongs?.map(({ releaseMonth }) => releaseMonth)).size >= 5;
    const sharedPartyStages = mode === PARTY_MODE
      ? partyStages.filter(({ mode: stageMode }) => [GUESS_SONG_MODE, SENIORITY_MODE, SORTING_MODE].includes(stageMode))
      : [];
    const minimumPartySongs = mode === PARTY_MODE
      ? Math.max(...sharedPartyStages.map(({ mode: stageMode, roundCount }) => minimumSongsForMode(stageMode, roundCount)), 0)
      : 0;
    const error = !nickname ? '昵称须为 1–12 个字符'
      : body?.catalogVersion !== catalogVersion ? '题库版本已更新，请刷新页面'
        : !supportsMode(mode) ? '联机玩法无效'
          : mode === PARTY_MODE && partyError ? partyError
          : !crosswordSelectionValid ? '曲名填字仅支持全曲库、禾念系和五维介质系'
            : partyStageSelectionError ? partyStageSelectionError
              : !pool ? '曲库配置无效'
              : mode === PARTY_MODE && modeSongs.length < minimumPartySongs ? '当前曲库不足以支持派对模式中的全部玩法'
                : !hasComparableDates ? '老资历曲库至少需要两个不同发布时间的歌曲'
                  : !hasSortableDates ? '排序曲库不足以生成每轮五首且整场不重复的题目'
                    : !hasTriathlonDates ? '铁人三项曲库至少需要五个不同发布时间的歌曲'
                      : mode === PARTY_MODE ? null
                        : validateMatchConfig({ capacity: body.capacity, roundCount: body.roundCount, songCount: modeSongs.length, mode });
    if (error) throw Object.assign(new Error(error), { status: 400 });
    return {
      mode, nickname, capacity: body.capacity,
      roundCount: mode === PARTY_MODE ? partyStageTotalRounds(stages) : body.roundCount,
      stages: mode === PARTY_MODE ? stages.map(({ mode: stageMode, roundCount, selection }) => ({ mode: stageMode, roundCount: Number(roundCount), ...(selection ? { selection } : {}) })) : null,
      selection: body.selection, poolName: pool.name, poolSongIds: modeSongs.map(({ id }) => id),
    };
  }
}
