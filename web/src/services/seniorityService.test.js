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
  it.each([[9, 2, 3], [10, 1, 2], [19, 1, 2], [20, 1, 1], [29, 1, 1], [30, 0, 0], [39, 0, 0], [40, 0, 0], [100, 0, 0]])('得分 %i 的难度边界', (score, minYears, maxYears) => {
    expect(difficultyForScore(score)).toMatchObject({ minYears, maxYears });
  });

  it.each(['older', 'newer'])('%s 连续五题同年后第六题换年份，答错也计入题数', (direction) => {
    const pool = [2020, 2021].flatMap((year) => Array.from({ length: 10 }, (_, i) => song(`${year}-${i}`, `${year}-${String(i + 1).padStart(2, '0')}`)));
    const service = createSeniorityService(pool, { random: () => 0, direction });
    const initial = service.startGame();
    let game = {
      ...initial, score: 30, usedIds: [pool[0].id, pool[1].id],
      round: { ...initial.round, left: pool[0], right: pool[1], correctId: pool[direction === 'older' ? 0 : 1].id },
    };
    for (let i = 0; i < 5; i += 1) {
      expect(game.round.left.releaseMonth.slice(0, 4)).toBe('2020');
      expect(game.round.right.releaseMonth.slice(0, 4)).toBe('2020');
      const choice = i === 2 ? [game.round.left, game.round.right].find(({ id }) => id !== game.round.correctId).id : game.round.correctId;
      game = service.nextRound(service.choose(game, choice));
    }
    expect(game.round.number).toBe(6);
    expect(game.round.left.releaseMonth.slice(0, 4)).toBe('2021');
    expect(game.round.right.releaseMonth.slice(0, 4)).toBe('2021');
    expect(game.round.left.releaseMonth).not.toBe(game.round.right.releaseMonth);
    expect(game.selectionStreakCount).toBe(0);
    expect(new Set(game.usedIds).size).toBe(game.usedIds.length);
    expect(game.history.flatMap(({ left, right }) => [left.id, right.id])).not.toContain(game.round.left.id);
    expect(game.history.flatMap(({ left, right }) => [left.id, right.id])).not.toContain(game.round.right.id);
    const correct = direction === 'older' ? game.round.left : game.round.right;
    expect(game.round.correctId).toBe(correct.id);
  });

  it('只有一个年份时保持可玩，不重复使用旧歌曲', () => {
    const pool = Array.from({ length: 10 }, (_, i) => song(`s${i}`, `2020-${String(i + 1).padStart(2, '0')}`));
    const service = createSeniorityService(pool, { random: () => 0 });
    let game = service.startGame();
    for (let i = 0; i < 5; i += 1) game = service.nextRound(service.choose(game, game.round.correctId));
    expect(game.status).toBe('playing');
    expect(game.round.number).toBe(6);
    expect(game.usedIds).toHaveLength(7);
  });

  it('按分数收紧年份差距', () => {
    expect(difficultyForScore(0)).toMatchObject({ minYears: 2, maxYears: 3 });
    expect(difficultyForScore(10)).toMatchObject({ minYears: 1, maxYears: 2 });
    expect(difficultyForScore(20)).toMatchObject({ minYears: 1, maxYears: 1 });
    expect(difficultyForScore(30)).toMatchObject({ minYears: 0, maxYears: 0 });
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
    const oneYear = service.nextRound(makeRevealed(songs[0], 20));
    expect(Math.abs(Number(oneYear.round.left.releaseMonth.slice(0, 4)) - Number(oneYear.round.right.releaseMonth.slice(0, 4)))).toBe(1);
    const sameYear = service.nextRound(makeRevealed(songs.find(({ id }) => id === 'e'), 30));
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

  it('小资历模式将发布时间更新的歌曲判为正确', () => {
    const service = createSeniorityService(songs, { random: () => 0, direction: 'newer' });
    const game = service.startGame();
    const expected = game.round.left.releaseMonth > game.round.right.releaseMonth ? game.round.left.id : game.round.right.id;
    expect(game.round.correctId).toBe(expected);
    expect(service.choose(game, expected)).toMatchObject({ score: 1, lives: 3, status: 'revealed' });
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

  it('小资历连续三次选择同一首较新歌曲后改为保留较早歌曲', () => {
    const service = createSeniorityService(songs, { random: () => 0, direction: 'newer' });
    const oldSong = songs.find(({ id }) => id === 'a');
    const newerSong = songs.find(({ id }) => id === 'b');
    const game = {
      ...service.startGame(), status: 'revealed', score: 3, carrySide: 'right',
      selectionStreakSongId: newerSong.id, selectionStreakCount: 3,
      usedIds: [oldSong.id, newerSong.id],
      round: { number: 3, left: oldSong, right: newerSong, selectedId: newerSong.id, correctId: newerSong.id, outcome: 'correct', direction: 'newer' },
    };
    const next = service.nextRound(game);
    expect(next.round.left.id).toBe(oldSong.id);
    expect(next.selectionStreakCount).toBe(0);
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

  it('曲库全部出现后立即完成，不能反复点击最后两首歌刷分', () => {
    const tinySongs = [song('old', '2013-01'), song('middle', '2015-01'), song('new', '2017-01')];
    const service = createSeniorityService(tinySongs, { random: () => 0 });
    const first = service.startGame();
    const firstResult = service.choose(first, first.round.correctId);
    const second = service.nextRound(firstResult);
    const completed = service.choose(second, second.round.correctId);
    expect(completed.status).toBe('completed');
    expect(completed.usedIds).toHaveLength(3);
    expect(completed.history).toHaveLength(2);
    expect(service.choose(completed, completed.round.correctId)).toBe(completed);
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
    expect([0, 10, 20, 30, 40].map((score) => seniorityEvaluation(score).title)).toEqual([
      '初来乍到', '小有资历', '资深听众', '曲库考古家', '活化石级资历',
    ]);
  });

  it('小资历使用独立结算评价', () => {
    expect(seniorityEvaluation(40, 'newer').title).toBe('追新雷达满格');
  });
});
