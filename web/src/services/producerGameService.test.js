import { describe, expect, it } from 'vitest';
import { createProducerGameService, evaluateProducerGuess, normalizeProducerSearch } from './producerGameService';

const answer = {
  id: 'answer', name: 'ChiliChill（Yu.H、CuSummer）', aliases: ['Yu.H', 'CuSummer'], searchKeys: ['chilichillyuhcusummer', 'yuh', 'cusummer'],
  debutDate: '2020-03-11', debutYear: 2020, debutSong: '第一首歌', representativeSongs: ['甲', '乙', '丙', '丁', '戊'], hallCount: 10, legendCount: 5, mythCount: 1, famous: true,
};
const guess = {
  id: 'guess', name: '猜测者', aliases: [], searchKeys: ['猜测者'], debutDate: '2018-01-01', debutYear: 2018, debutSong: '另一首歌', representativeSongs: ['甲', '己', '庚', '辛', '壬'], hallCount: 12, legendCount: 8, mythCount: 0, famous: false,
};

describe('producer game service', () => {
  it('归一化大小写、空格、标点并可通过括号别名搜索', () => {
    expect(normalizeProducerSearch('Yu.H ')).toBe('yuh');
    const service = createProducerGameService([answer, guess], { random: () => 0 });
    expect(service.resolveProducer('yu.h')?.id).toBe('answer');
    expect(service.search('SUMMER').map((item) => item.id)).toEqual(['answer']);
  });

  it('按年份、动态数量阈值和代表曲交集生成反馈', () => {
    const feedback = evaluateProducerGuess(answer, guess);
    expect(feedback.debutYear).toEqual({ state: 'near', direction: 'up' });
    expect(feedback.hallCount.state).toBe('near');
    expect(feedback.legendCount.state).toBe('miss');
    expect(feedback.mythCount.state).toBe('near');
    expect(feedback.representativeSongs.map((item) => item.matched)).toEqual([true, false, false, false, false]);
  });

  it('同年猜测自动揭示年份与出道曲且不消耗提示', () => {
    const sameYear = { ...guess, id: 'same-year', debutYear: 2020, searchKeys: ['同年'] };
    const service = createProducerGameService([answer, sameYear], { random: () => 0 });
    const game = service.startGame(null, answer.id);
    const result = service.submitGuess(game, sameYear.id).game;
    expect(result.yearDebutRevealed).toBe(true);
    expect(result.hintLevel).toBe(0);
    expect(service.useHint(result).hintLevel).toBe(1);
  });

  it('阻止重复猜测并支持投降和新局避开上一题', () => {
    const service = createProducerGameService([answer, guess], { random: () => 0 });
    const game = service.startGame(null, answer.id);
    const first = service.submitGuess(game, guess.id).game;
    expect(service.submitGuess(first, guess.id).error).toMatch('已经猜过');
    expect(service.surrender(first).status).toBe('surrendered');
    expect(service.startGame(answer.id).answer.id).toBe('guess');
  });
});
