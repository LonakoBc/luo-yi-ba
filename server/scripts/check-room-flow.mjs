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
  console.log(JSON.stringify({
    ok: true, apiBase, code: creator.code, protocolVersion: finished.protocolVersion,
    scores: finished.ranking.map(({ nickname, score }) => ({ nickname, score })),
  }, null, 2));
} finally {
  first.close();
  second.close();
}
