import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RoomManager, catalogVersion } from '../src/roomManager.js';

class MockSocket {
  constructor() { this.readyState = 1; this.messages = []; }
  send(value) { this.messages.push(JSON.parse(value)); }
}

test('creates, joins and runs an authoritative two-player match', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => { throw error; } });
  await manager.initialize();
  let code;
  try {
    const config = manager.validateCreate({
      nickname: '玩家一', capacity: 2, roundCount: 1,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    });
    const creator = await manager.create(config);
    code = creator.code;
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/u);
    const room = manager.get(code);
    const joiner = await room.run(() => room.join({ nickname: '玩家二' }));
    const firstSocket = new MockSocket();
    const secondSocket = new MockSocket();
    await room.run(() => room.connect(creator.resumeToken, firstSocket));
    await room.run(() => room.connect(joiner.resumeToken, secondSocket));
    await room.run(() => room.command(firstSocket, { type: 'start_match' }));
    assert.equal(room.room.phase, 'playing');
    const answerId = room.room.answerId;
    await Promise.all([
      room.run(() => room.command(firstSocket, { type: 'submit_guess', songId: answerId })),
      room.run(() => room.command(secondSocket, { type: 'submit_guess', songId: answerId })),
    ]);
    assert.equal(room.room.phase, 'finished');
    assert.deepEqual(room.room.players.map(({ score }) => score), [5, 3]);
    const projectedForSecond = secondSocket.messages.at(-1).room;
    const opponent = projectedForSecond.players.find(({ id }) => id === creator.playerId);
    assert.equal(opponent.guesses[0].isCorrect, true);
    assert.equal('song' in opponent.guesses[0], false);
    assert.equal(JSON.stringify(opponent.guesses).includes(answerId), false);
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects duplicate nicknames and invalid catalog versions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory });
  await manager.initialize();
  let code;
  try {
    assert.throws(() => manager.validateCreate({
      nickname: '玩家', capacity: 2, roundCount: 1,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion: 'stale',
    }), /题库版本/u);
    const result = await manager.create(manager.validateCreate({
      nickname: '玩家', capacity: 2, roundCount: 1,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = result.code;
    await assert.rejects(manager.get(code).run(() => manager.get(code).join({ nickname: '玩家' })), /相同昵称/u);
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});
