import { describe, expect, it } from 'vitest';
import { countTitleCharacters, createLocalGameService, evaluateGuess, normalizeSearchText } from './gameService';

const song = (overrides) => ({
  id: 'pu-tong-disco',
  title: '普通DISCO',
  staffDisplay: 'ilem（UP主、作曲）',
  staffMembers: ['ilem'],
  year: 2015,
  voicebank: 'VOCALOID',
  vocalType: '合唱',
  special: '神话曲',
  lyrics: '在这普通的一天',
  bilibiliUrl: 'https://www.bilibili.com/video/av1',
  ...overrides,
});

describe('搜索与解析', () => {
  const songs = [song({}), song({ id: 'ge', title: '歌', year: 2026, voicebank: 'ACE' })];
  const service = createLocalGameService(songs, { random: () => 0 });

  it('忽略符号、空格和英文大小写', () => {
    expect(normalizeSearchText('《普通 DISCO！》')).toBe('普通disco');
    expect(service.resolveSong('普通 disco')?.id).toBe('pu-tong-disco');
  });

  it('支持拼音文件名和唯一模糊匹配', () => {
    expect(service.resolveSong('pu-tong-disco')?.title).toBe('普通DISCO');
    expect(service.resolveSong('tongdis')?.title).toBe('普通DISCO');
  });
});

describe('反馈判定', () => {
  const answer = song({});

  it('STAFF 完全相同标绿，任一人员重合标黄', () => {
    const feedback = evaluateGuess(song({
      id: 'other', staffMembers: ['another', 'ilem'], special: '无',
    }), song({ special: '无' }));
    expect(feedback.staff.state).toBe('near');
    expect(evaluateGuess(song({ id: 'same', staffMembers: ['ilem'] }), song({})).staff.state).toBe('exact');
  });

  it('曲名字符数相同标绿，不提供相近黄色', () => {
    expect(evaluateGuess(song({ id: 'march', title: '三月雨' }), song({ title: '上山岗' })).title.state).toBe('exact');
    expect(evaluateGuess(song({ id: 'short', title: '三月雨' }), song({ title: '光与影的对白' })).title).toEqual({ state: 'miss', direction: 'up' });
    expect(evaluateGuess(song({ id: 'long', title: '光与影的对白' }), song({ title: '三月雨' })).title).toEqual({ state: 'miss', direction: 'down' });
  });

  it('字数忽略空格和标点，数字与英文字母逐个计数', () => {
    expect(countTitleCharacters('I LOVE U')).toBe(6);
    expect(countTitleCharacters('66CCFF')).toBe(6);
    expect(countTitleCharacters('Attack!')).toBe(6);
    expect(countTitleCharacters('9Bang15便士')).toBe(9);
  });

  it('相差一年标黄，并正确指示答案年份方向', () => {
    expect(evaluateGuess(song({ id: 'a', year: 2014 }), answer).year).toEqual({ state: 'near', direction: 'up' });
    expect(evaluateGuess(song({ id: 'b', year: 2016 }), answer).year).toEqual({ state: 'near', direction: 'down' });
    expect(evaluateGuess(song({ id: 'c', year: 2012 }), answer).year).toEqual({ state: 'miss', direction: 'up' });
  });
});

describe('游戏流程', () => {
  const songs = [song({ id: 'first', title: '第一首' }), song({ id: 'second', title: '第二首' })];
  const service = createLocalGameService(songs, { random: () => 0 });

  it('新游戏避开上一题，且阻止重复猜测', () => {
    const first = service.startGame();
    expect(first.answer.id).toBe('first');
    expect(service.startGame('first').answer.id).toBe('second');
    const wrong = service.submitGuess(first, 'second').game;
    expect(service.submitGuess(wrong, 'second').error).toBe('这首歌已经猜过了');
  });

  it('提示最多使用三次且答对后停止游戏', () => {
    let game = service.startGame();
    for (let index = 0; index < 4; index += 1) game = service.useHint(game);
    expect(game.hintLevel).toBe(3);
    game = service.submitGuess(game, game.answer.id).game;
    expect(game.status).toBe('won');
    expect(service.submitGuess(game, 'second').error).toBe('游戏已经结束');
  });

  it('可以投降并揭晓答案', () => {
    const game = service.surrender(service.startGame());
    expect(game.status).toBe('surrendered');
    expect(service.submitGuess(game, 'second').error).toBe('游戏已经结束');
  });
});
