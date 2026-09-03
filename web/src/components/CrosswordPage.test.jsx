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
  return screen.getByRole('button', { name: new RegExp('选择 ' + entry.number + ' 号', 'u') }).closest('article');
}

function clickTile(character) {
  const tile = screen.getAllByRole('button', { name: '字块：' + character }).find((button) => !button.disabled);
  expect(tile, '应该存在可用的字块：' + character).toBeTruthy();
  fireEvent.click(tile);
}

function fillEntry(entry, puzzle, characterForIndex = (index) => entry.characters[index]) {
  const cells = new Map(puzzle.cells.map((cell) => [entryCellKey(cell), cell]));
  fireEvent.click(within(clueFor(entry)).getByRole('button', { name: /选择/u }));
  entryCellKeys(entry).forEach((key, index) => {
    const cell = cells.get(key);
    if (cell.isFixed) return;
    const cellButton = document.querySelector('[data-crossword-cell="' + key + '"]');
    if (!cellButton?.getAttribute('aria-label')?.endsWith('空白字格')) return;
    clickTile(characterForIndex(index));
  });
}

function entryCellKey(cell) {
  return cell.row + ',' + cell.column;
}

function fillAllEntries(puzzle) {
  puzzle.entries.forEach((entry) => fillEntry(entry, puzzle));
}

describe('曲名填字页面', () => {
  it('使用固定上限字块池，不再显示打字框或单曲提交按钮，并支持歌词提示', () => {
    const puzzle = renderPuzzle();
    expect(screen.getAllByRole('button', { name: /^字块：/u })).toHaveLength(32);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /提交本条/u })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '填写这首' })).toHaveLength(6);
    expect(screen.getAllByLabelText(/号曲名第/u).length).toBe(puzzle.cells.length);
    const search = screen.getByRole('searchbox', { name: '搜索字块' });
    const searchableCharacter = screen.getAllByRole('button', { name: /^字块：/u })[0].getAttribute('aria-label').replace('字块：', '');
    fireEvent.change(search, { target: { value: searchableCharacter } });
    expect(screen.getAllByRole('button', { name: '字块：' + searchableCharacter }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '清空字块搜索' }));
    expect(screen.getAllByRole('button', { name: /^字块：/u })).toHaveLength(32);
    const firstClue = clueFor(puzzle.entries[0]);
    fireEvent.click(within(firstClue).getByRole('button', { name: '歌词提示' }));
    expect(firstClue.querySelector('.crossword-lyrics')).toHaveTextContent(puzzle.entries[0].song.lyrics.replaceAll('　', ' '));
    fireEvent.click(within(firstClue).getByRole('button', { name: '收起歌词' }));
    expect(firstClue.querySelector('.crossword-lyrics')).not.toBeInTheDocument();
  });

  it('填满一行或一列后自动验证，错误显示红色边缘并计入一次验证', () => {
    const puzzle = renderPuzzle(2026);
    const entry = puzzle.entries[0];
    const cells = new Map(puzzle.cells.map((cell) => [entryCellKey(cell), cell]));
    const wrongCharacters = screen.getAllByRole('button', { name: /^字块：/u })
      .map((button) => button.getAttribute('aria-label').replace('字块：', ''))
      .filter((character, index, characters) => !entry.characters.includes(character) && characters.indexOf(character) === index);
    fillEntry(entry, puzzle, (index) => {
      const cell = cells.get(entryCellKeys(entry)[index]);
      return cell.isFixed ? entry.characters[index] : wrongCharacters[index] || wrongCharacters[0];
    });
    expect(screen.getByRole('status')).toHaveTextContent('自动验证未通过');
    expect(clueFor(entry)).toHaveClass('wrong');
    expect(document.querySelectorAll('.crossword-cell.entry-' + entry.direction + '-wrong').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('1 次自动验证');
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('1 次错误');
  });

  it('全部曲名正确后弹出通关提示，可查看答案页并快速开始下一把', () => {
    const puzzle = renderPuzzle(66);
    fillAllEntries(puzzle);
    const dialog = screen.getByRole('dialog', { name: '曲名填字完成！' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent('全部绿色，回答正确！');
    expect(dialog).toHaveTextContent('6次自动验证');
    fireEvent.click(within(dialog).getByRole('button', { name: '查看答案' }));
    const answerPage = screen.getByRole('dialog', { name: '曲名答案页' });
    expect(answerPage).toBeVisible();
    for (const entry of puzzle.entries) expect(within(answerPage).getByText('《' + entry.song.title + '》')).toBeVisible();
    fireEvent.click(within(answerPage).getByRole('button', { name: '快速开始下一把' }));
    expect(screen.queryByRole('dialog', { name: '曲名答案页' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^字块：/u })).toHaveLength(32);
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('0 次自动验证');
  });

  it('点击已填写字格可以把字块退回池中，重置会清空本局进度', () => {
    const puzzle = renderPuzzle(2025);
    const entry = puzzle.entries[0];
    const editableKey = entryCellKeys(entry).find((key) => !puzzle.cells.find((cell) => entryCellKey(cell) === key).isFixed);
    fireEvent.click(within(clueFor(entry)).getByRole('button', { name: /选择/u }));
    clickTile(entry.characters[entryCellKeys(entry).indexOf(editableKey)]);
    const cellButton = document.querySelector('[data-crossword-cell="' + editableKey + '"]');
    expect(cellButton).not.toHaveAttribute('aria-label', expect.stringContaining('空白字格'));
    fireEvent.click(cellButton);
    expect(screen.getByRole('status')).toHaveTextContent('退回池中');
    expect(document.querySelector('[data-crossword-cell="' + editableKey + '"]')).toHaveAttribute('aria-label', expect.stringContaining('空白字格'));
    fireEvent.click(screen.getByRole('button', { name: '重置填写' }));
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('0 次自动验证');
    expect(screen.getByRole('status')).toHaveTextContent('已重置本局全部填写');
  });

  it('允许把单个字块拖动到指定空格，并显示拖拽目标高亮', () => {
    const puzzle = renderPuzzle(2023);
    const entry = puzzle.entries[0];
    const key = entryCellKeys(entry).find((candidate) => !puzzle.cells.find((cell) => entryCellKey(cell) === candidate).isFixed);
    const index = entryCellKeys(entry).indexOf(key);
    const cell = document.querySelector('[data-crossword-cell="' + key + '"]');
    const tile = screen.getAllByRole('button', { name: '字块：' + entry.characters[index] }).find((button) => !button.disabled);
    expect(tile).toBeTruthy();
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      value: '',
      setData: (_type, value) => { dataTransfer.value = value; },
      getData: () => dataTransfer.value,
    };
    fireEvent.dragStart(tile, { dataTransfer });
    fireEvent.dragOver(cell, { dataTransfer });
    expect(cell).toHaveClass('drag-over');
    fireEvent.drop(cell, { dataTransfer });
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining(entry.characters[index]));
  });

  it('投降后打开答案页且不触发通关结算', () => {
    const puzzle = renderPuzzle(2024);
    fireEvent.click(screen.getByRole('button', { name: '投降' }));
    const confirmation = screen.getByRole('dialog', { name: '要揭晓全部曲名吗？' });
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认投降' }));
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('答案 已揭晓');
    expect(screen.getByRole('dialog', { name: '曲名答案页' })).toBeVisible();
    for (const entry of puzzle.entries) expect(screen.getByText('《' + entry.song.title + '》')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: '曲名填字完成！' })).not.toBeInTheDocument();
  });
});
