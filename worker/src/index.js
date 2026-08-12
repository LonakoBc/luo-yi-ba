import songs from '../../web/src/data/songs.generated.json';
import presets from '../../web/src/data/presets.generated.json';
import { filterSongs, songsForPreset } from '../../web/src/services/libraryService.js';
import {
  HOST_RECONNECT_GRACE_MS, HINT_STEPS, MULTIPLAYER_MODE, MULTIPLAYER_PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET, ROOM_RETENTION_MS, ROUND_DURATION_MS,
  applyGuess, catalogVersionFor, hintLevelAt, isFinalRound, projectRoom, roundCompletionState, validateMatchConfig,
} from '../../web/src/services/multiplayerRules.js';

const catalogVersion = catalogVersionFor(songs);
const songsById = new Map(songs.map((song) => [song.id, song]));

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function randomString(length, alphabet = ROOM_CODE_ALPHABET) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}

function validNickname(value) {
  const nickname = String(value ?? '').trim();
  return nickname.length >= 1 && [...nickname].length <= 12 ? nickname : null;
}

function selectPool(selection) {
  if (selection?.kind === 'preset') {
    const preset = presets.find((item) => item.id === selection.presetId);
    return preset ? { songs: songsForPreset(songs, preset), name: preset.name } : null;
  }
  if (selection?.kind === 'custom' && selection.filters) {
    return { songs: filterSongs(songs, selection.filters), name: '自定义曲库' };
  }
  return null;
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = new Set(['https://luo-yi-ba.pages.dev', env.FRONTEND_ORIGIN].filter(Boolean));
  if (allowed.has(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin)) return origin;
  return false;
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (allowedOrigin(request, env) === false) return json({ error: '不允许的来源' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } });

    if (request.method === 'GET' && url.pathname === '/api/catalog') return json({ catalogVersion, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION }, 200, cors);
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readBody(request);
      const nickname = validNickname(body?.nickname);
      const pool = selectPool(body?.selection);
      const error = !nickname ? '昵称须为 1–12 个字符'
        : body?.catalogVersion !== catalogVersion ? '题库版本已更新，请刷新页面'
          : !pool ? '曲库配置无效'
            : validateMatchConfig({ capacity: body.capacity, roundCount: body.roundCount, songCount: pool.songs.length });
      if (error) return json({ error }, 400, cors);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = randomString(6);
        const stub = env.GUESS_ROOMS.get(env.GUESS_ROOMS.idFromName(code));
        const response = await stub.fetch('https://room.internal/init', { method: 'POST', body: JSON.stringify({ code, nickname, capacity: body.capacity, roundCount: body.roundCount, selection: body.selection, poolName: pool.name, poolSongIds: pool.songs.map(({ id }) => id) }) });
        if (response.status === 409) continue;
        return json(await response.json(), response.status, cors);
      }
      return json({ error: '暂时无法生成房间码，请重试' }, 503, cors);
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|socket))?$/u);
    if (!match) return json({ error: '接口不存在' }, 404, cors);
    const [, code, action] = match;
    const stub = env.GUESS_ROOMS.get(env.GUESS_ROOMS.idFromName(code));
    const internalUrl = new URL(`https://room.internal/${action ?? 'state'}`);
    url.searchParams.forEach((value, key) => internalUrl.searchParams.set(key, value));
    const headers = new Headers(request.headers);
    headers.delete('origin');
    const response = await stub.fetch(internalUrl, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body });
    if (response.status === 101) return response;
    const responseHeaders = new Headers(response.headers);
    Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value));
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  },
};

export class GuessRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;
  }

  async load() {
    if (!this.room) this.room = await this.ctx.storage.get('room') ?? null;
    return this.room;
  }

  async save() {
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put('room', this.room);
    await this.scheduleAlarm();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = await this.load();
    if (url.pathname === '/init' && request.method === 'POST') {
      if (room) return json({ error: '房间码冲突' }, 409);
      const input = await request.json();
      const player = this.newPlayer(input.nickname, 0);
      this.room = { protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, mode: MULTIPLAYER_MODE, code: input.code, phase: 'waiting', capacity: input.capacity, roundCount: input.roundCount, roundNumber: 0, hostId: player.id, selection: input.selection, poolName: input.poolName, poolSongIds: input.poolSongIds, usedSongIds: [], players: [player], answerId: null, answer: null, startedAt: null, endsAt: null, nextRoundAt: null, hintLevel: 0, createdAt: Date.now(), updatedAt: Date.now(), allOfflineAt: null };
      await this.save();
      return json({ code: input.code, playerId: player.id, resumeToken: player.resumeToken });
    }
    if (!room) return json({ error: '房间不存在或已过期' }, 404);
    if (url.pathname === '/join' && request.method === 'POST') return this.join(await request.json());
    if (url.pathname === '/socket' && request.headers.get('upgrade') === 'websocket') return this.connect(url.searchParams.get('token'));
    return json({ error: '请求无效' }, 400);
  }

  newPlayer(nickname, joinOrder) {
    return { id: crypto.randomUUID(), resumeToken: randomString(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), nickname, joinOrder, online: false, disconnectedAt: Date.now(), score: 0, roundScore: 0, guesses: [] };
  }

  async join(input) {
    if (this.room.phase !== 'waiting') return json({ error: '游戏已经开始，房间已锁定' }, 409);
    if (this.room.players.length >= this.room.capacity) return json({ error: '房间已满' }, 409);
    const nickname = validNickname(input?.nickname);
    if (!nickname) return json({ error: '昵称须为 1–12 个字符' }, 400);
    if (this.room.players.some((player) => player.nickname.toLocaleLowerCase('zh-CN') === nickname.toLocaleLowerCase('zh-CN'))) return json({ error: '房间内已有相同昵称' }, 409);
    const player = this.newPlayer(nickname, Math.max(-1, ...this.room.players.map(({ joinOrder }) => joinOrder)) + 1);
    this.room.players.push(player);
    await this.save();
    this.broadcast();
    return json({ code: this.room.code, playerId: player.id, resumeToken: player.resumeToken });
  }

  async connect(token) {
    const player = this.room.players.find((item) => item.resumeToken === token);
    if (!player) return json({ error: '恢复凭据无效' }, 401);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`player:${player.id}`]);
    server.serializeAttachment({ playerId: player.id });
    player.online = true;
    player.disconnectedAt = null;
    this.room.allOfflineAt = null;
    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    const { playerId } = ws.deserializeAttachment() ?? {};
    const player = this.room.players.find((item) => item.id === playerId);
    if (!player) return;
    let message;
    try { message = JSON.parse(raw); } catch { return this.sendError(ws, '消息格式无效'); }
    if (message.type === 'sync') return this.sendState(ws, playerId);
    if (message.type === 'start_match') return this.startMatch(player, ws);
    if (message.type === 'submit_guess') return this.submitGuess(player, message.songId, ws);
    if (message.type === 'leave_room') return this.leave(player);
    return this.sendError(ws, '未知命令');
  }

  async webSocketClose(ws) {
    await this.load();
    const { playerId } = ws.deserializeAttachment() ?? {};
    const player = this.room.players.find((item) => item.id === playerId);
    if (!player) return;
    player.online = this.ctx.getWebSockets(`player:${playerId}`).some((socket) => socket !== ws && socket.readyState === WebSocket.OPEN);
    if (!player.online) player.disconnectedAt = Date.now();
    if (this.room.players.every((item) => !item.online)) this.room.allOfflineAt = Date.now();
    await this.save();
    this.broadcast();
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

  async startMatch(player, ws) {
    if (player.id !== this.room.hostId) return this.sendError(ws, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.sendError(ws, '游戏已经开始');
    if (this.room.players.length !== this.room.capacity) return this.sendError(ws, '等待玩家坐满后才能开始');
    await this.startRound();
  }

  async startRound() {
    const candidates = this.room.poolSongIds.filter((id) => !this.room.usedSongIds.includes(id));
    const answerId = candidates[Math.floor(Math.random() * candidates.length)];
    const now = Date.now();
    this.room.roundNumber += 1;
    this.room.phase = 'playing';
    this.room.answerId = answerId;
    this.room.answer = songsById.get(answerId);
    this.room.usedSongIds.push(answerId);
    this.room.startedAt = now;
    this.room.endsAt = now + ROUND_DURATION_MS;
    this.room.nextRoundAt = null;
    this.room.hintLevel = 0;
    this.room.players.forEach((item) => { item.roundScore = 0; item.guesses = []; });
    await this.save();
    this.broadcast();
  }

  async submitGuess(player, songId, ws) {
    if (this.room.phase !== 'playing') return this.sendError(ws, '当前不能提交猜测');
    const song = songsById.get(songId);
    if (!song || !this.room.poolSongIds.includes(songId)) return this.sendError(ws, '歌曲不在当前曲库中');
    const correctCount = this.room.players.filter((item) => item.roundScore > 0).length;
    const result = applyGuess({ player, song, answer: this.room.answer, receivedAt: Date.now(), endsAt: this.room.endsAt, correctCount });
    if (result.error) return this.sendError(ws, result.error);
    player.guesses.push({ song, feedback: result.feedback, receivedAt: Date.now() });
    if (result.points) { player.roundScore = result.points; player.score += result.points; }
    if (this.room.players.every((item) => item.roundScore > 0)) await this.finishRound();
    else { await this.save(); this.broadcast(); }
  }

  async finishRound() {
    if (this.room.phase !== 'playing') return;
    const completion = roundCompletionState(this.room.roundNumber, this.room.roundCount, Date.now());
    this.room.phase = completion.phase;
    this.room.nextRoundAt = completion.nextRoundAt;
    await this.save();
    this.broadcast();
  }

  transferHost() {
    const next = [...this.room.players].filter((player) => player.online).sort((a, b) => a.joinOrder - b.joinOrder)[0];
    this.room.hostId = next?.id ?? null;
  }

  async alarm() {
    await this.load();
    const now = Date.now();
    if (!this.room) return;
    for (const player of [...this.room.players]) {
      if (!player.online && player.disconnectedAt && now - player.disconnectedAt >= HOST_RECONNECT_GRACE_MS) {
        const wasHost = player.id === this.room.hostId;
        if (this.room.phase === 'waiting') this.room.players = this.room.players.filter((item) => item.id !== player.id);
        if (wasHost) this.transferHost();
      }
    }
    if (this.room.phase === 'playing') {
      if (now >= this.room.endsAt) await this.finishRound();
      else this.room.hintLevel = hintLevelAt(this.room.startedAt, now);
    } else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
      if (isFinalRound(this.room.roundNumber, this.room.roundCount)) {
        this.room.phase = 'finished'; this.room.nextRoundAt = null; await this.save(); this.broadcast();
      } else await this.startRound();
    }
    if (this.room.allOfflineAt && now - this.room.allOfflineAt >= ROOM_RETENTION_MS) {
      await this.ctx.storage.deleteAll(); this.room = null; return;
    }
    if (this.room) { await this.save(); this.broadcast(); }
  }

  async scheduleAlarm() {
    const times = [];
    const now = Date.now();
    if (this.room.phase === 'playing') {
      for (const step of HINT_STEPS) if (this.room.startedAt + step.afterMs > now) times.push(this.room.startedAt + step.afterMs);
      times.push(this.room.endsAt);
    }
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
    for (const player of this.room.players) if (!player.online && player.disconnectedAt) times.push(player.disconnectedAt + HOST_RECONNECT_GRACE_MS);
    if (this.room.allOfflineAt) times.push(this.room.allOfflineAt + ROOM_RETENTION_MS);
    const next = times.filter((time) => time > now).sort((a, b) => a - b)[0];
    if (next) await this.ctx.storage.setAlarm(next);
  }

  sendState(ws, playerId) { ws.send(JSON.stringify({ type: 'state', room: projectRoom(this.room, playerId) })); }
  sendError(ws, error) { ws.send(JSON.stringify({ type: 'error', error })); }
  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const { playerId } = ws.deserializeAttachment() ?? {};
      try { this.sendState(ws, playerId); } catch { /* closed socket */ }
    }
  }
}
