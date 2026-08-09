import { describe, expect, it } from 'vitest';
import songs from '../data/songs.generated.json';
import { entryCellKeys, generateCrossword, getCrosswordSongPool, isPureHanTitle } from './crosswordService';

function seededRandom(seed = 712) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('曲名填字棋盘生成', () => {
  it('严格筛选纯汉字并只保留可组成六首棋盘的连通分量', () => {
    expect(songs.filter(({ title }) => isPureHanTitle(title))).toHaveLength(212);
    expect(getCrosswordSongPool(songs, 6)).toHaveLength(193);
    expect(getCrosswordSongPool(songs, 6).some(({ title }) => title === '世末歌者')).toBe(true);
    expect(isPureHanTitle('普通DISCO')).toBe(false);
    expect(isPureHanTitle('滚！')).toBe(false);
  });

  it('生成六首连通、字符一致且没有非法相贴的棋盘', () => {
    const puzzle = generateCrossword(songs, { random: seededRandom(), attempts: 12 });
    expect(puzzle.entries).toHaveLength(6);
    expect(new Set(puzzle.entries.map(({ id }) => id)).size).toBe(6);
    expect(puzzle.cells.filter(({ isIntersection }) => isIntersection).length).toBeGreaterThanOrEqual(5);
    expect(puzzle.cells.filter(({ isFixed }) => isFixed)).toHaveLength(2);

    const cells = new Map(puzzle.cells.map((cell) => [`${cell.row},${cell.column}`, cell]));
    for (const entry of puzzle.entries) {
      expect(entryCellKeys(entry)).toHaveLength(entry.characters.length);
      entryCellKeys(entry).forEach((key, index) => expect(cells.get(key).character).toBe(entry.characters[index]));
    }
    const fixedEntries = puzzle.cells.filter(({ isFixed }) => isFixed).map((cell) => {
      expect(cell.isIntersection).toBe(false);
      const entry = puzzle.entries.find(({ id }) => id === cell.entryIds[0]);
      expect(`${cell.row},${cell.column}`).toBe(entryCellKeys(entry)[0]);
      expect(cell.character).toBe(entry.characters[0]);
      return entry.id;
    });
    expect(new Set(fixedEntries).size).toBe(2);
    for (const cell of puzzle.cells) {
      for (const [rowOffset, columnOffset] of [[0, 1], [1, 0]]) {
        const neighbor = cells.get(`${cell.row + rowOffset},${cell.column + columnOffset}`);
        if (!neighbor) continue;
        expect(cell.entryIds.some((id) => neighbor.entryIds.includes(id))).toBe(true);
      }
    }
  });

  it('数据无法组成六首连通棋盘时给出明确错误', () => {
    const isolated = ['甲', '乙', '丙', '丁', '戊', '己'].map((title, index) => ({ id: String(index), title }));
    expect(() => generateCrossword(isolated, { random: seededRandom() })).toThrow('至少需要 6 首');
  });
});
