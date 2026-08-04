import { describe, expect, it } from 'vitest';
import { createLocalGameService, evaluateGuess, normalizeSearchText } from './gameService';

const song = (overrides = {}) => ({
  id: 'pu-tong-disco',
  title: '普通DISCO',
  staffDisplay: 'UP主：ilem；作曲：ilem',
  staffPeople: ['ilem'],
  releaseMonth: '2015-03',
  singersDisplay: '洛天依；言和',
  singerMembers: ['洛天依', '言和'],
  voicebanksDisplay: 'VOCALOID',
  voicebankMembers: ['VOCALOID'],
  concertCount: 4,
  special: '单曲',
  lyrics: '在这普通的一天',
  bilibiliUrl: 'https://www.bilibili.com/video/av1',
  vcpediaUrl: 'https://vcpedia.cn/普通DISCO',
  ...overrides,
});

describe('搜索与解析', () => {
  const songs = [song(), song({ id: 'ge', title: '歌', releaseMonth: '2026-01' })];
  const service = createLocalGameService(songs, { random: () => 0 });

  it('忽略符号、空格和英文大小写并支持拼音', () => {
    expect(normalizeSearchText('《普通 DISCO！》')).toBe('普通disco');
    expect(service.resolveSong('普通 disco')?.id).toBe('pu-tong-disco');
    expect(service.resolveSong('pu-tong-disco')?.title).toBe('普通DISCO');
  });
});

describe('反馈判定', () => {
  const answer = song();

  it('曲名始终为中性，不再提供字数反馈', () => {
    expect(evaluateGuess(song({ id: 'other', title: '三月雨' }), answer).title).toEqual({ state: 'neutral', direction: null });
  });

  it('STAFF、歌姬与声库返回重合成员', () => {
    const feedback = evaluateGuess(song({
      id: 'other', staffPeople: ['ilem', '另一人'], singerMembers: ['洛天依'], voicebankMembers: ['VOCALOID', 'ACE Studio'],
    }), answer);
    expect(feedback.staff).toMatchObject({ state: 'partial', matches: ['ilem'] });
    expect(feedback.singers).toMatchObject({ state: 'partial', matches: ['洛天依'] });
    expect(feedback.voicebanks).toMatchObject({ state: 'partial', matches: ['vocaloid'] });
  });

  it('发布时间分别判断年份、月份并指示完整时间方向', () => {
    const close = evaluateGuess(song({ id: 'a', releaseMonth: '2013-03' }), answer).releaseMonth;
    expect(close.year.state).toBe('near');
    expect(close.month.state).toBe('exact');
    expect(close.direction).toBe('up');
    const sameYear = evaluateGuess(song({ id: 'b', releaseMonth: '2015-08' }), answer).releaseMonth;
    expect(sameYear.year.state).toBe('exact');
    expect(sameYear.month.state).toBe('miss');
    expect(sameYear.direction).toBe('down');
  });

  it('演唱会次数相同标绿、差值不超过2标黄并显示方向', () => {
    expect(evaluateGuess(song({ id: 'a', concertCount: 4 }), answer).concertCount.state).toBe('exact');
    expect(evaluateGuess(song({ id: 'b', concertCount: 2 }), answer).concertCount).toEqual({ state: 'near', direction: 'up' });
    expect(evaluateGuess(song({ id: 'c', concertCount: 8 }), answer).concertCount).toEqual({ state: 'miss', direction: 'down' });
  });
});

describe('游戏流程', () => {
  const songs = [song({ id: 'first', title: '第一首' }), song({ id: 'second', title: '第二首', releaseMonth: '2015-11', concertCount: 99 })];
  const service = createLocalGameService(songs, { random: () => 0 });

  it('新游戏避开上一题，且阻止重复猜测', () => {
    const first = service.startGame();
    expect(first.answer.id).toBe('first');
    expect(service.startGame('first').answer.id).toBe('second');
    const wrong = service.submitGuess(first, 'second').game;
    expect(service.submitGuess(wrong, 'second').error).toBe('这首歌已经猜过了');
  });

  it('提示最多三次且答对后停止游戏', () => {
    let game = service.startGame();
    for (let index = 0; index < 4; index += 1) game = service.useHint(game);
    expect(game.hintLevel).toBe(3);
    game = service.submitGuess(game, game.answer.id).game;
    expect(game.status).toBe('won');
    expect(service.submitGuess(game, 'second').error).toBe('游戏已经结束');
  });

  it('人员、歌姬、声库、年份和特殊标注相同时自动揭示歌词，忽略月份与次数', () => {
    const game = service.submitGuess(service.startGame(), 'second').game;
    expect(game.status).toBe('playing');
    expect(game.hintLevel).toBe(3);
  });

  it('可以投降并揭晓答案', () => {
    const game = service.surrender(service.startGame());
    expect(game.status).toBe('surrendered');
  });
});
