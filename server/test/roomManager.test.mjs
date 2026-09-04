import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RoomManager, catalogVersion } from '../src/roomManager.js';
import producers from '../../web/src/data/producers.generated.json' with { type: 'json' };

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
    await room.run(() => room.command(firstSocket, { type: 'send_emote', emoteId: 'luotianyi-hit' }));
    assert.deepEqual(firstSocket.messages.at(-1), secondSocket.messages.at(-1));
    assert.equal(secondSocket.messages.at(-1).type, 'emote');
    assert.equal(secondSocket.messages.at(-1).playerId, creator.playerId);
    assert.equal(secondSocket.messages.at(-1).emoteId, 'luotianyi-hit');
    await room.run(() => room.command(secondSocket, { type: 'send_emote', emoteId: 'not-an-emote' }));
    assert.equal(secondSocket.messages.at(-1).error, '表情无效');
    await room.run(() => room.command(secondSocket, { type: 'sync' }));
    let waitingState = secondSocket.messages.at(-1).room;
    assert.deepEqual(waitingState.players.map(({ seatIndex, color }) => [seatIndex, color.id, color.colorName]), [
      [0, 'luotianyi', '天依蓝'],
      [1, 'yuezhengling', '乐正绫红'],
    ]);
    await room.run(() => room.command(firstSocket, { type: 'select_color', colorId: 'chiyu' }));
    assert.equal(room.room.players[0].colorId, 'chiyu');
    await room.run(() => room.command(secondSocket, { type: 'select_color', colorId: 'chiyu' }));
    assert.equal(secondSocket.messages.at(-1).error, '这个颜色已经被其他玩家选择');
    await room.run(() => room.command(secondSocket, { type: 'select_color', colorId: 'shian' }));
    waitingState = secondSocket.messages.at(-1).room;
    assert.deepEqual(waitingState.players.map(({ color }) => [color.id, color.color]), [['chiyu', '#EE6666'], ['shian', '#F6C65B']]);
    await room.run(() => room.command(firstSocket, { type: 'start_match' }));
    assert.equal(room.room.phase, 'playing');
    await room.run(() => room.command(firstSocket, { type: 'select_color', colorId: 'muxin' }));
    assert.equal(firstSocket.messages.at(-1).error, '游戏开始后不能更换颜色');
    assert.equal(room.room.players[0].colorId, 'chiyu');
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

test('reuses the lowest available waiting-room seat while preserving existing player order', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => { throw error; } });
  await manager.initialize();
  let code;
  try {
    const result = await manager.create(manager.validateCreate({
      nickname: '一号玩家', capacity: 4, roundCount: 3,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = result.code;
    const session = manager.get(code);
    await session.run(() => session.join({ nickname: '二号玩家' }));
    const third = await session.run(() => session.join({ nickname: '三号玩家' }));
    assert.deepEqual(session.room.players.map(({ seatIndex }) => seatIndex), [0, 1, 2]);
    const departing = session.playerForToken(third.resumeToken);
    await session.run(() => session.leave(departing));
    await session.run(() => session.join({ nickname: '新玩家' }));
    assert.deepEqual(session.room.players.map(({ joinOrder, seatIndex }) => [joinOrder, seatIndex]), [[0, 0], [1, 1], [2, 2]]);
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});

test('runs a synchronized seniority match with private choices and unified rank scoring', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => { throw error; } });
  await manager.initialize();
  let code;
  try {
    const creator = await manager.create(manager.validateCreate({
      mode: 'seniority', nickname: '老玩家', capacity: 2, roundCount: 5,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = creator.code;
    const session = manager.get(code);
    const joiner = await session.run(() => session.join({ nickname: '新玩家' }));
    const firstSocket = new MockSocket();
    const secondSocket = new MockSocket();
    await session.run(() => session.connect(creator.resumeToken, firstSocket));
    await session.run(() => session.connect(joiner.resumeToken, secondSocket));
    await session.run(() => session.command(firstSocket, { type: 'start_match' }));
    assert.equal(session.room.mode, 'seniority');
    assert.equal(session.room.phase, 'playing');
    assert.equal(secondSocket.messages.at(-1).room.seniorityRound.left.releaseMonth, null);

    for (let round = 1; round <= 5; round += 1) {
      const correctId = session.room.seniorityPair.correctId;
      await session.run(() => session.command(firstSocket, { type: 'submit_seniority_choice', songId: correctId }));
      const privateProjection = secondSocket.messages.at(-1).room;
      assert.equal(privateProjection.players[0].answered, true);
      assert.equal(privateProjection.players[0].choiceId, null);
      const secondChoiceId = round === 5
        ? [session.room.seniorityPair.leftId, session.room.seniorityPair.rightId].find((id) => id !== correctId)
        : correctId;
      await session.run(() => session.command(secondSocket, { type: 'submit_seniority_choice', songId: secondChoiceId }));
      assert.equal(session.room.phase, 'round-result');
      assert.deepEqual(session.room.players.map(({ roundScore }) => roundScore), round === 5 ? [5, 0] : [5, 3]);
      const reveal = secondSocket.messages.at(-1).room;
      assert.ok(reveal.seniorityRound.left.releaseMonth);
      assert.equal(reveal.players[0].choiceId, correctId);
      session.room.nextRoundAt = Date.now() - 1;
      await session.run(() => session.tick());
      if (round < 5) assert.equal(session.room.phase, 'playing');
    }
    assert.equal(session.room.phase, 'finished');
    assert.deepEqual(session.room.players.map(({ score }) => score), [25, 12]);
    assert.deepEqual(secondSocket.messages.at(-1).room.ranking.map(({ rank }) => rank), [1, 2]);
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});

test('runs private synchronized sorting rounds and scores relative order by rank', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => { throw error; } });
  await manager.initialize();
  let code;
  try {
    const creator = await manager.create(manager.validateCreate({
      mode: 'sorting', nickname: '排序甲', capacity: 2, roundCount: 3,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = creator.code;
    const session = manager.get(code);
    const joiner = await session.run(() => session.join({ nickname: '排序乙' }));
    const firstSocket = new MockSocket();
    const secondSocket = new MockSocket();
    await session.run(() => session.connect(creator.resumeToken, firstSocket));
    await session.run(() => session.connect(joiner.resumeToken, secondSocket));
    await session.run(() => session.command(firstSocket, { type: 'start_match' }));
    assert.equal(session.room.mode, 'sorting');
    assert.equal(session.room.sortingRound.initialOrderIds.length, 5);
    assert.equal(new Set(session.room.sortingRound.answerIds.map((id) => session.room.poolSongIds.includes(id))).size, 1);
    assert.equal(secondSocket.messages.at(-1).room.sortingRound.songs[0].releaseMonth, null);

    for (let round = 1; round <= 3; round += 1) {
      const answer = session.room.sortingRound.answerIds;
      const reverse = [...answer].reverse();
      await session.run(() => session.command(firstSocket, { type: 'update_sorting_order', orderIds: answer }));
      const privateState = secondSocket.messages.at(-1).room;
      assert.equal(privateState.players[0].moveCount, 1);
      assert.equal(privateState.players[0].orderIds, null);
      await session.run(() => session.command(firstSocket, { type: 'submit_sorting_order', orderIds: answer }));
      const secondOrder = round === 1 ? reverse : round === 2 ? answer : [answer[0], answer[1], answer[2], answer[4], answer[3]];
      await session.run(() => session.command(secondSocket, { type: 'submit_sorting_order', orderIds: secondOrder }));
      assert.equal(session.room.phase, 'round-result');
      assert.deepEqual(session.room.players.map(({ roundScore }) => roundScore), round === 1 ? [5, 0] : round === 2 ? [5, 5] : [5, 3]);
      const reveal = secondSocket.messages.at(-1).room;
      assert.ok(reveal.sortingRound.songs[0].releaseMonth);
      assert.deepEqual(reveal.players.map(({ correctPairs }) => correctPairs), round === 1 ? [10, 0] : round === 2 ? [10, 10] : [10, 9]);
      session.room.nextRoundAt = Date.now() - 1;
      await session.run(() => session.tick());
    }
    assert.equal(session.room.phase, 'finished');
    assert.deepEqual(session.room.players.map(({ score }) => score), [15, 8]);
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});

test('runs all nine fixed triathlon rounds with cumulative scoring and progressive seniority difficulty', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => { throw error; } });
  await manager.initialize();
  let code;
  try {
    const creator = await manager.create(manager.validateCreate({
      mode: 'triathlon', nickname: '全能甲', capacity: 2, roundCount: 9,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = creator.code;
    const session = manager.get(code);
    const joiner = await session.run(() => session.join({ nickname: '全能乙' }));
    const firstSocket = new MockSocket();
    const secondSocket = new MockSocket();
    await session.run(() => session.connect(creator.resumeToken, firstSocket));
    await session.run(() => session.connect(joiner.resumeToken, secondSocket));
    await session.run(() => session.command(firstSocket, { type: 'start_match' }));

    for (let overallRound = 1; overallRound <= 9; overallRound += 1) {
      const projection = secondSocket.messages.at(-1).room;
      assert.equal(projection.mode, 'triathlon');
      assert.equal(projection.overallRoundNumber, overallRound);
      assert.equal(projection.roundNumber, ((overallRound - 1) % 3) + 1);
      if (overallRound <= 3) {
        assert.equal(projection.activeMode, 'guess-song');
        const answerId = session.room.answerId;
        await session.run(() => session.command(firstSocket, { type: 'submit_guess', songId: answerId }));
        await session.run(() => session.command(secondSocket, { type: 'submit_guess', songId: answerId }));
        assert.deepEqual(session.room.players.map(({ roundScore }) => roundScore), [5, 3]);
      } else if (overallRound <= 6) {
        assert.equal(projection.activeMode, 'sorting');
        const answerIds = session.room.sortingRound.answerIds;
        await session.run(() => session.command(firstSocket, { type: 'submit_sorting_order', orderIds: answerIds }));
        await session.run(() => session.command(secondSocket, { type: 'submit_sorting_order', orderIds: answerIds }));
        assert.deepEqual(session.room.players.map(({ roundScore }) => roundScore), [5, 5]);
      } else {
        assert.equal(projection.activeMode, 'seniority');
        assert.equal(session.room.seniorityPair.difficulty.label, overallRound < 9 ? '年代进阶' : '资历决胜');
        const correctId = session.room.seniorityPair.correctId;
        await session.run(() => session.command(firstSocket, { type: 'submit_seniority_choice', songId: correctId }));
        await session.run(() => session.command(secondSocket, { type: 'submit_seniority_choice', songId: correctId }));
        assert.deepEqual(session.room.players.map(({ roundScore }) => roundScore), [5, 3]);
      }
      assert.equal(session.room.phase, 'round-result');
      session.room.nextRoundAt = Date.now() - 1;
      await session.run(() => session.tick());
    }
    assert.equal(session.room.phase, 'finished');
    assert.deepEqual(session.room.players.map(({ score }) => score), [45, 33]);
    assert.equal(new Set(session.room.usedSongIds).size, 24);
    const finalProjection = secondSocket.messages.at(-1).room;
    assert.equal(finalProjection.nextLabel, '结算');
    assert.deepEqual(finalProjection.ranking.map(({ nickname, rank }) => [nickname, rank]), [['全能甲', 1], ['全能乙', 2]]);
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});

test('settles a four-player triathlon guess round when only two players solve before timeout', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const errors = [];
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => errors.push(error) });
  await manager.initialize();
  let code;
  try {
    const creator = await manager.create(manager.validateCreate({
      mode: 'triathlon', nickname: '玩家一', capacity: 4, roundCount: 9,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = creator.code;
    const session = manager.get(code);
    const identities = [creator];
    for (const nickname of ['玩家二', '玩家三', '玩家四']) identities.push(await session.run(() => session.join({ nickname })));
    const sockets = identities.map(() => new MockSocket());
    for (let index = 0; index < identities.length; index += 1) {
      await session.run(() => session.connect(identities[index].resumeToken, sockets[index]));
    }
    await session.run(() => session.command(sockets[0], { type: 'start_match' }));
    const answerId = session.room.answerId;
    await session.run(() => session.command(sockets[0], { type: 'submit_guess', songId: answerId }));
    await session.run(() => session.command(sockets[1], { type: 'submit_guess', songId: answerId }));
    assert.equal(session.room.phase, 'playing');

    session.room.endsAt = Date.now() - 1;
    await session.run(() => session.command(sockets[2], { type: 'sync' }));

    assert.equal(session.room.phase, 'round-result');
    assert.deepEqual(session.room.players.map(({ roundScore }) => roundScore), [5, 3, 0, 0]);
    assert.equal(errors.length, 0);
    for (const socket of sockets) {
      const state = socket.messages.at(-1).room;
      assert.equal(state.phase, 'round-result');
      assert.equal(state.answer.id, answerId);
      assert.equal(state.players.filter(({ solved }) => solved).length, 2);
      assert.equal(state.players.filter(({ solved }) => !solved).length, 2);
    }
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

test('rejects combining a music preset with singer playlists in a party stage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory });
  await manager.initialize();
  try {
    assert.throws(() => manager.validateCreate({
      mode: 'party', nickname: '房主', capacity: 2, roundCount: 3,
      selection: { kind: 'preset', presetId: 'all' },
      stages: [
        { mode: 'guess-song', roundCount: 1 },
        { mode: 'seniority', roundCount: 1 },
        { mode: 'music-guess', roundCount: 1, selection: { kind: 'music-playlists', musicPlaylistIds: ['all', 'luotianyi'] } },
      ],
      catalogVersion,
    }), /预设曲库不能和歌姬曲库组合/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runs a famous-producer match through a wrong guess and a correct guess without projection errors', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luoyiba-room-'));
  const manager = new RoomManager({ dataDirectory: directory, onError: (error) => { throw error; } });
  await manager.initialize();
  let code;
  try {
    const creator = await manager.create(manager.validateCreate({
      mode: 'producer-famous', nickname: '名P玩家', capacity: 2, roundCount: 1,
      selection: { kind: 'preset', presetId: 'all' }, catalogVersion,
    }));
    code = creator.code;
    const session = manager.get(code);
    const joiner = await session.run(() => session.join({ nickname: '名P玩家二' }));
    const socket = new MockSocket();
    const joinerSocket = new MockSocket();
    await session.run(() => session.connect(creator.resumeToken, socket));
    await session.run(() => session.connect(joiner.resumeToken, joinerSocket));
    await session.run(() => session.command(socket, { type: 'start_match' }));
    const answerId = session.room.producerAnswerId;
    const wrongId = producers.find((producer) => producer.famous && producer.id !== answerId).id;
    await session.run(() => session.command(socket, { type: 'submit_producer_guess', producerId: wrongId }));
    assert.equal(session.room.phase, 'playing');
    assert.equal(socket.messages.at(-1).room.players[0].guesses.length, 1);
    await session.run(() => session.command(joinerSocket, { type: 'submit_producer_guess', producerId: answerId }));
    await session.run(() => session.command(socket, { type: 'submit_producer_guess', producerId: answerId }));
    assert.equal(session.room.phase, 'round-result');
    assert.deepEqual(session.room.players.map(({ score }) => score), [3, 5]);
    assert.equal(socket.messages.at(-1).room.producerRound.answer.id, answerId);
    session.room.nextRoundAt = Date.now() - 1;
    await session.run(() => session.tick());
    assert.equal(session.room.phase, 'finished');
  } finally {
    if (code) await manager.delete(code);
    await rm(directory, { recursive: true, force: true });
  }
});
