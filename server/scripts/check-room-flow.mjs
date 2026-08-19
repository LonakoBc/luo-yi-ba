import { WebSocket } from 'ws';
import songs from '../../web/src/data/songs.generated.json' with { type: 'json' };
import { createDefaultFilters, filterSongs } from '../../web/src/services/libraryService.js';

const apiBase = String(process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/u, '');
const filters = {
  ...createDefaultFilters(songs),
  collections: ['haiyi'], singers: ['洛天依'], fromYear: 2021, toYear: 2021,
};
const pool = filterSongs(songs, filters);
if (pool.length !== 1) throw new Error(`Expected one smoke-test song, received ${pool.length}`);

async function post(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error}`);
  return result;
}

function connect(code, token) {
  const url = new URL(apiBase);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/api/rooms/${code}/socket`;
  url.search = new URLSearchParams({ token });
  const socket = new WebSocket(url);
  socket.states = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'state') socket.states.push(message.room);
  });
  return new Promise((resolve, reject) => {
    socket.once('message', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitFor(socket, predicate, timeoutMs = 5_000) {
  const existing = socket.states.findLast(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for room state')); }, timeoutMs);
    const onMessage = () => {
      const state = socket.states.at(-1);
      if (state && predicate(state)) { cleanup(); resolve(state); }
    };
    const cleanup = () => { clearTimeout(timeout); socket.off('message', onMessage); };
    socket.on('message', onMessage);
  });
}

const catalogResponse = await fetch(`${apiBase}/api/catalog`);
const catalog = await catalogResponse.json();
const expectedModes = ['guess-song', 'seniority', 'sorting', 'triathlon'];
if (catalog.protocolVersion !== 3) throw new Error(`Expected protocol v3, received v${catalog.protocolVersion}`);
if (!expectedModes.every((mode) => catalog.modes?.includes(mode))) throw new Error(`Missing multiplayer modes: ${JSON.stringify(catalog.modes)}`);
const checks = [];
const creator = await post('/api/rooms', {
  nickname: '公网测试甲', capacity: 2, roundCount: 1,
  selection: { kind: 'custom', filters }, catalogVersion: catalog.catalogVersion,
});
const joiner = await post(`/api/rooms/${creator.code}/join`, { nickname: '公网测试乙' });
const first = await connect(creator.code, creator.resumeToken);
const second = await connect(creator.code, joiner.resumeToken);
try {
  await waitFor(first, (room) => room.players.length === 2 && room.players.every(({ online }) => online));
  first.send(JSON.stringify({ type: 'start_match' }));
  await waitFor(first, (room) => room.phase === 'playing');
  first.send(JSON.stringify({ type: 'submit_guess', songId: pool[0].id }));
  await waitFor(first, (room) => room.players.find(({ id }) => id === creator.playerId)?.score === 5);
  second.send(JSON.stringify({ type: 'submit_guess', songId: pool[0].id }));
  const finished = await waitFor(second, (room) => room.phase === 'finished');
  checks.push({ mode: 'guess-song', code: creator.code, phase: finished.phase, scores: finished.ranking.map(({ nickname, score }) => ({ nickname, score })) });
} finally {
  first.close();
  second.close();
}

async function checkAdditionalMode(mode, roundCount) {
  const host = await post('/api/rooms', {
    mode, nickname: `${mode}甲`, capacity: 2, roundCount,
    selection: { kind: 'preset', presetId: 'all' }, catalogVersion: catalog.catalogVersion,
  });
  const guest = await post(`/api/rooms/${host.code}/join`, { nickname: `${mode}乙` });
  const hostSocket = await connect(host.code, host.resumeToken);
  const guestSocket = await connect(host.code, guest.resumeToken);
  try {
    await waitFor(hostSocket, (room) => room.players.length === 2 && room.players.every(({ online }) => online));
    hostSocket.send(JSON.stringify({ type: 'start_match' }));
    const playing = await waitFor(hostSocket, (room) => room.phase === 'playing');
    if (playing.mode !== mode) throw new Error(`${mode} projected as ${playing.mode}`);
    if (mode === 'seniority') {
      const songId = playing.seniorityRound.left.id;
      hostSocket.send(JSON.stringify({ type: 'submit_seniority_choice', songId }));
      guestSocket.send(JSON.stringify({ type: 'submit_seniority_choice', songId }));
      await waitFor(hostSocket, (room) => room.phase === 'round-result');
    } else if (mode === 'sorting') {
      const hostOrder = playing.players.find(({ id }) => id === host.playerId).orderIds;
      const guestState = await waitFor(guestSocket, (room) => room.phase === 'playing');
      const guestOrder = guestState.players.find(({ id }) => id === guest.playerId).orderIds;
      hostSocket.send(JSON.stringify({ type: 'submit_sorting_order', orderIds: hostOrder }));
      guestSocket.send(JSON.stringify({ type: 'submit_sorting_order', orderIds: guestOrder }));
      await waitFor(hostSocket, (room) => room.phase === 'round-result');
    } else if (mode === 'triathlon' && playing.activeMode !== 'guess-song') {
      throw new Error(`Triathlon started with ${playing.activeMode}`);
    }
    checks.push({ mode, code: host.code, phase: mode === 'triathlon' ? 'playing' : 'round-result' });
  } finally {
    hostSocket.close();
    guestSocket.close();
  }
}

await checkAdditionalMode('seniority', 5);
await checkAdditionalMode('sorting', 3);
await checkAdditionalMode('triathlon', 9);

console.log(JSON.stringify({ ok: true, apiBase, protocolVersion: catalog.protocolVersion, modes: catalog.modes, checks }, null, 2));
