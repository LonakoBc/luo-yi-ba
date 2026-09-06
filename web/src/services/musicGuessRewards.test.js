import { describe, expect, it } from 'vitest';
import { createMusicGuessService, getMusicGuessTracks, createMusicGuessPlaylist } from './musicGuessService';

const tracks = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `歌${i}`, clipUrl: `/t${i}.mp3` }));

describe('听歌识曲跳过与连对奖励', () => {
  it('合唱选项包含所有歌姬，不包含企划标签', () => {
    const manifest = tracks.map((t) => ({ fileName: t.id + '.mp3', sourceName: t.name, playlistIds: ['luotianyi', 'yanhe', 'wangchuan'] }));
    expect(getMusicGuessTracks(createMusicGuessPlaylist(['all']), { manifest })[0].artist).toBe('洛天依、言和');
  });

  it.each(['unlimited', 'timed'])('%s 跳过三次后禁用，无分血变化且不重复出题', (mode) => {
    const service = createMusicGuessService(tracks, { random: () => 0, mode, durationSeconds: 60 });
    let game = service.startGame();
    game = service.nextRound(service.chooseAnswer(game, game.round.answer.id));
    const skippedIds = [];
    for (let i = 0; i < 3; i++) {
      skippedIds.push(game.round.answer.id);
      game = service.skip(game);
      expect(game).toMatchObject({ score: 1, lives: 3, correctStreak: 0, skipsRemaining: 2 - i, status: 'playing' });
      expect(skippedIds).not.toContain(game.round.answer.id);
    }
    expect(game.history.filter(({ outcome }) => outcome === 'skipped')).toHaveLength(3);
    expect(service.skip(game)).toBe(game);
    expect(service.startGame().skipsRemaining).toBe(3);
    const settled = service.surrender(game);
    expect(service.skip(settled)).toBe(settled);
  });

  it.each(['unlimited', 'timed'])('%s 五连对奖励可重复并超过三点，错误与跳过中断连对', (mode) => {
    const service = createMusicGuessService(tracks, { random: () => 0, mode, durationSeconds: 60 });
    let game = service.startGame();
    for (let i = 1; i <= 10; i++) {
      game = service.chooseAnswer(game, game.round.answer.id);
      expect(game.lives).toBe(3 + Math.floor(i / 5));
      expect(game.round.lifeReward).toBe(i % 5 === 0 ? 1 : 0);
      expect(service.chooseAnswer(game, game.round.answer.id)).toBe(game);
      game = service.nextRound(game);
    }
    game = service.chooseAnswer(game, game.round.options.find(({ id }) => id !== game.round.answer.id).id);
    expect(game).toMatchObject({ lives: 4, correctStreak: 0 });
    game = service.nextRound(game);
    game = service.nextRound(service.chooseAnswer(game, game.round.answer.id));
    expect(service.skip(game).correctStreak).toBe(0);
    if (mode === 'timed') expect(service.timeUp(game).lifeBonus).toBe(5);
  });

  it('最后一题跳过可完成，限时生命奖励只结算一次', () => {
    const service = createMusicGuessService(tracks.slice(0, 4), { random: () => 0, mode: 'timed', durationSeconds: 60 });
    let game = service.startGame();
    for (let i = 0; i < 3; i++) game = service.nextRound(service.chooseAnswer(game, game.round.answer.id));
    game = service.skip(game);
    expect(game).toMatchObject({ status: 'completed', baseScore: 3, score: 8, lifeBonus: 5, lives: 3 });
    expect(service.skip(game)).toBe(game);
    expect(service.timeUp(game)).toBe(game);
    expect(service.surrender(game)).toBe(game);
  });
});
