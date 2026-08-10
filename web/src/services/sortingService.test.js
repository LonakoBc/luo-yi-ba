import { describe, expect, it } from 'vitest';
import { createSortingPuzzle, scoreTimeline, scoreYears } from './sortingService';

const songs = Array.from({ length: 12 }, (_, index) => ({
  id: `song-${index}`,
  title: `歌曲${index}`,
  releaseMonth: `${2012 + index}-${String((index % 12) + 1).padStart(2, '0')}`,
}));

describe('歌曲大排序服务', () => {
  it('时间线模式选出不同年月并给出从早到晚答案', () => {
    const puzzle = createSortingPuzzle(songs, { mode: 'timeline', count: 5, random: () => 0 });
    expect(puzzle.answer).toHaveLength(5);
    expect(new Set(puzzle.answer.map(({ releaseMonth }) => releaseMonth)).size).toBe(5);
    expect(puzzle.answer.map(({ releaseMonth }) => releaseMonth)).toEqual([...puzzle.answer].map(({ releaseMonth }) => releaseMonth).sort());
    expect(puzzle.initialOrder.map(({ id }) => id)).not.toEqual(puzzle.answer.map(({ id }) => id));
  });

  it('年份归位模式选出不同年份', () => {
    const puzzle = createSortingPuzzle(songs, { mode: 'years', count: 10, random: () => 0.4 });
    expect(new Set(puzzle.years).size).toBe(10);
  });

  it('分别按正确位置和正确年份计分', () => {
    const puzzle = createSortingPuzzle(songs, { mode: 'timeline', count: 5, random: () => 0 });
    expect(scoreTimeline(puzzle.answer, puzzle.answer)).toBe(5);
    const assignments = Object.fromEntries(puzzle.answer.map((song) => [song.id, song.releaseMonth.slice(0, 4)]));
    expect(scoreYears(assignments, puzzle.answer)).toBe(5);
    assignments[puzzle.answer[0].id] = '2099';
    expect(scoreYears(assignments, puzzle.answer)).toBe(4);
  });
});
