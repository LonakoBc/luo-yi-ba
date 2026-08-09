import { describe, expect, it } from 'vitest';
import { createSeniorityService, difficultyForScore, seniorityEvaluation } from './seniorityService';

const song = (id, releaseMonth, concertCount = 0) => ({
  id, title: id, releaseMonth, concertCount, staffDisplay: `UP主：${id}`,
});

const songs = [
  song('a', '2015-01'), song('g', '2016-06'), song('b', '2017-02', 3), song('c', '2018-03'),
  song('d', '2019-04'), song('e', '2020-05'), song('f', '2020-11'),
];

describe('谁是老资历游戏服务', () => {
  it('按分数切换四个难度阶段', () => {
    expect(difficultyForScore(0)).toMatchObject({ minYears: 2, maxYears: 3 });
    expect(difficultyForScore(5)).toMatchObject({ minYears: 1, maxYears: 2 });
    expect(difficultyForScore(10)).toMatchObject({ minYears: 1, maxYears: 1 });
    expect(difficultyForScore(15)).toMatchObject({ minYears: 0, maxYears: 0 });
  });

  it('下一题会按当前分数收紧年份差距并最终进入同年比较', () => {
    const service = createSeniorityService(songs, { random: () => 0 });
    const base = service.startGame();
    const makeRevealed = (anchor, score) => ({
      ...base,
      status: 'revealed',
      score,
      carrySide: 'left',
      usedIds: [anchor.id],
      round: { ...base.round, left: anchor, selectedId: anchor.id },
    });
    const oneYear = service.nextRound(makeRevealed(songs[0], 10));
    expect(Math.abs(Number(oneYear.round.left.releaseMonth.slice(0, 4)) - Number(oneYear.round.right.releaseMonth.slice(0, 4)))).toBe(1);
    const sameYear = service.nextRound(makeRevealed(songs.find(({ id }) => id === 'e'), 15));
    expect(sameYear.round.left.releaseMonth.slice(0, 4)).toBe(sameYear.round.right.releaseMonth.slice(0, 4));
    expect(sameYear.round.left.releaseMonth).not.toBe(sameYear.round.right.releaseMonth);
  });

  it('开局不选择同一歌曲或同一月份', () => {
    const game = createSeniorityService(songs, { random: () => 0 }).startGame();
    expect(game.round.left.id).not.toBe(game.round.right.id);
    expect(game.round.left.releaseMonth).not.toBe(game.round.right.releaseMonth);
  });

  it('答对加分、答错扣血并保留玩家选择的位置', () => {
    const service = createSeniorityService(songs, { random: () => 0 });
    const start = service.startGame();
    const correct = service.choose(start, start.round.correctId);
    expect(correct.score).toBe(1);
    expect(correct.lives).toBe(3);
    expect(correct.status).toBe('revealed');
    const carriedId = correct.round.selectedId;
    const next = service.nextRound(correct);
    expect(next.round[correct.carrySide].id).toBe(carriedId);

    const wrongId = next.round.left.id === next.round.correctId ? next.round.right.id : next.round.left.id;
    expect(service.choose(next, wrongId).lives).toBe(2);
  });

  it('同一首较早歌曲连续正确选择三次后改为保留本轮较新歌曲', () => {
    const service = createSeniorityService(songs, { random: () => 0 });
    const oldSong = songs.find(({ id }) => id === 'a');
    const newerSong = songs.find(({ id }) => id === 'b');
    const game = {
      ...service.startGame(),
      status: 'revealed',
      score: 3,
      carrySide: 'left',
      selectionStreakSongId: oldSong.id,
      selectionStreakCount: 3,
      usedIds: [oldSong.id, newerSong.id],
      round: {
        number: 3,
        left: oldSong,
        right: newerSong,
        selectedId: oldSong.id,
        correctId: oldSong.id,
        outcome: 'correct',
      },
    };
    const next = service.nextRound(game);
    expect(next.round.right.id).toBe(newerSong.id);
    expect(next.selectionStreakCount).toBe(0);
    expect(next.selectionStreakSongId).toBeNull();
  });

  it('三次错误后生命耗尽且不能继续答题', () => {
    const service = createSeniorityService(songs, { random: () => 0.25 });
    let game = service.startGame();
    for (let index = 0; index < 3; index += 1) {
      const wrongId = game.round.left.id === game.round.correctId ? game.round.right.id : game.round.left.id;
      game = service.choose(game, wrongId);
      if (index < 2) game = service.nextRound(game);
    }
    expect(game).toMatchObject({ lives: 0, status: 'lost' });
    expect(game.history).toHaveLength(3);
  });

  it('手动结算会记录尚未回答的当前轮', () => {
    const service = createSeniorityService(songs, { random: () => 0 });
    const settled = service.settle(service.startGame());
    expect(settled.status).toBe('settled');
    expect(settled.history[0].outcome).toBe('unanswered');
  });

  it('演唱会次数提升抽取权重', () => {
    const weighted = [song('normal', '2015-01', 0), song('concert', '2015-02', 3)];
    const service = createSeniorityService([...weighted, song('anchor', '2012-01')], { random: () => 0.3 });
    const game = service.startGame();
    expect([game.round.left.id, game.round.right.id]).toContain('concert');
  });

  it('提供五档结算评价', () => {
    expect([0, 5, 10, 15, 25].map((score) => seniorityEvaluation(score).title)).toEqual([
      '初来乍到', '小有资历', '资深听众', '曲库考古家', '活化石级资历',
    ]);
  });
});
