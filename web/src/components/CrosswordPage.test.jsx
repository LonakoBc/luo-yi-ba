import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import songs from '../data/songs.generated.json';
import { entryCellKeys, generateCrossword } from '../services/crosswordService';
import CrosswordPage from './CrosswordPage';

function seededRandom(seed = 712) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const Brand = () => <div>洛一把</div>;

function renderPuzzle(seed = 712) {
  const expected = generateCrossword(songs, { random: seededRandom(seed) });
  render(<CrosswordPage songs={songs} random={seededRandom(seed)} onBack={() => {}} Brand={Brand} />);
  return expected;
}

function clueFor(entry) {
  return screen.getByRole('button', { name: new RegExp(`选择 ${entry.number} 号`, 'u') }).closest('article');
}

function fillEntry(entry, puzzle, characterForIndex = (index) => entry.characters[index]) {
  const cells = new Map(puzzle.cells.map((cell) => [`${cell.row},${cell.column}`, cell]));
  fireEvent.click(within(clueFor(entry)).getByRole('button', { name: /选择/u }));
  entryCellKeys(entry).forEach((key, index) => {
    if (cells.get(key).isFixed) return;
    const input = screen.queryByLabelText(`${entry.number} 号曲名第 ${index + 1} 个字`);
    if (input) fireEvent.change(input, { target: { value: characterForIndex(index) } });
  });
}

describe('曲名填字页面', () => {
  it('初始仅显示两首不同歌曲的非交叉首字，可选择曲目并无限展开或收起歌词', () => {
    const puzzle = renderPuzzle();
    expect(screen.getAllByRole('button', { name: '提交本条' })).toHaveLength(6);
    expect(screen.getAllByLabelText(/号曲目的格子/u)).toHaveLength(2);
    expect(puzzle.cells.filter(({ isFixed }) => isFixed)).toHaveLength(2);
    screen.getAllByRole('textbox').forEach((input) => expect(input).toHaveValue(''));
    const firstClue = clueFor(puzzle.entries[0]);
    fireEvent.click(within(firstClue).getByRole('button', { name: '歌词提示' }));
    expect(firstClue.querySelector('.crossword-lyrics')).toHaveTextContent(puzzle.entries[0].song.lyrics.replaceAll('　', ' '));
    fireEvent.click(within(firstClue).getByRole('button', { name: '收起歌词' }));
    expect(firstClue.querySelector('.crossword-lyrics')).not.toBeInTheDocument();
  });

  it('不完整不计次，错误仅标红错误格，全部答对后显示结算统计', () => {
    const puzzle = renderPuzzle(2026);
    const first = puzzle.entries[0];
    fireEvent.click(within(clueFor(first)).getByRole('button', { name: '提交本条' }));
    expect(screen.getByRole('status')).toHaveTextContent('尚未填写完整');
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('0 次提交');

    fillEntry(first, puzzle, () => '错');
    fireEvent.click(within(clueFor(first)).getByRole('button', { name: '提交本条' }));
    expect(screen.getByRole('status')).toHaveTextContent('不正确');
    expect(document.querySelectorAll('.crossword-cell.incorrect').length).toBeGreaterThan(0);

    for (const entry of puzzle.entries) {
      fillEntry(entry, puzzle);
      fireEvent.click(within(clueFor(entry)).getByRole('button', { name: '提交本条' }));
    }
    const dialog = screen.getByRole('dialog', { name: '曲名填字完成！' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent('7次提交');
    expect(dialog).toHaveTextContent('1次错误');
    expect(within(dialog).getByRole('button', { name: '再来一局' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: '返回主页' })).toBeEnabled();
  });

  it('粘贴完整曲名时会跳过两个固定首字并正确填充', () => {
    const puzzle = renderPuzzle(66);
    const entry = puzzle.entries.find((candidate) => entryCellKeys(candidate).some((key) => {
      const cell = puzzle.cells.find(({ row, column }) => `${row},${column}` === key);
      return !cell.isFixed;
    }));
    const firstEditableIndex = entryCellKeys(entry).findIndex((key) => {
      const cell = puzzle.cells.find(({ row, column }) => `${row},${column}` === key);
      return !cell.isFixed;
    });
    fireEvent.click(within(clueFor(entry)).getByRole('button', { name: /选择/u }));
    const input = screen.getByLabelText(`${entry.number} 号曲名第 ${firstEditableIndex + 1} 个字`);
    fireEvent.paste(input, { clipboardData: { getData: () => entry.song.title } });
    fireEvent.click(within(clueFor(entry)).getByRole('button', { name: '提交本条' }));
    expect(within(clueFor(entry)).getByText(new RegExp(`已完成：《${entry.song.title}》`, 'u'))).toBeVisible();
  });

  it('允许删除错误文字，并可一键重置当前棋盘的全部进度', () => {
    const puzzle = renderPuzzle(2025);
    const cells = new Map(puzzle.cells.map((cell) => [`${cell.row},${cell.column}`, cell]));
    const entry = puzzle.entries.find((candidate) => entryCellKeys(candidate).filter((key) => !cells.get(key).isFixed).length >= 2);
    const editableKeys = entryCellKeys(entry).filter((key) => !cells.get(key).isFixed);
    const firstIndex = entryCellKeys(entry).indexOf(editableKeys[0]);
    const secondIndex = entryCellKeys(entry).indexOf(editableKeys[1]);
    fireEvent.click(within(clueFor(entry)).getByRole('button', { name: /选择/u }));
    const firstInput = screen.getByLabelText(`${entry.number} 号曲名第 ${firstIndex + 1} 个字`);
    const secondInput = screen.getByLabelText(`${entry.number} 号曲名第 ${secondIndex + 1} 个字`);

    fireEvent.change(firstInput, { target: { value: '错' } });
    expect(firstInput).toHaveValue('错');
    fireEvent.change(firstInput, { target: { value: '' } });
    expect(firstInput).toHaveValue('');

    fireEvent.change(firstInput, { target: { value: '错' } });
    fireEvent.change(secondInput, { target: { value: '字' } });
    fireEvent.keyDown(secondInput, { key: 'Backspace' });
    fireEvent.change(secondInput, { target: { value: '' } });
    fireEvent.keyDown(secondInput, { key: 'Backspace' });
    expect(firstInput).toHaveValue('');

    fillEntry(entry, puzzle, () => '错');
    fireEvent.click(within(clueFor(entry)).getByRole('button', { name: '提交本条' }));
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('1 次提交');
    fireEvent.click(screen.getByRole('button', { name: '重置填写' }));
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('0 次提交');
    expect(screen.getByRole('status')).toHaveTextContent('已重置本局全部填写');
    expect(screen.getAllByRole('button', { name: '提交本条' })).toHaveLength(6);
    expect(firstInput).toHaveValue('');
  });
});
