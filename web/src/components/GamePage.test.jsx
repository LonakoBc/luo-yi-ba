import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GamePage from './GamePage';

const songs = [{
  id: 'answer',
  title: '甲曲',
  staffDisplay: '作曲：甲；作词：乙',
  staffPeople: ['甲', '乙'],
  releaseMonth: '2020-01',
  singersDisplay: '洛天依',
  singerMembers: ['洛天依'],
  voicebanksDisplay: 'VOCALOID',
  voicebankMembers: ['VOCALOID'],
  concertCount: 1,
  special: '单曲',
  lyrics: '这是歌词提示',
}];

describe('GamePage', () => {
  it('三次提示在移动端提示卡中按顺序累计展示', () => {
    render(<GamePage songs={songs} poolName="测试曲库" random={() => 0} onBack={vi.fn()} />);

    expect(screen.queryByRole('complementary', { name: '已解锁提示' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /提示 1\/3/u }));
    expect(screen.getByRole('complementary', { name: '已解锁提示' })).toHaveTextContent('洛天依 · 2020-01');

    fireEvent.click(screen.getByRole('button', { name: /提示 2\/3/u }));
    expect(screen.getByRole('complementary', { name: '已解锁提示' })).toHaveTextContent('作曲：甲；作词：乙');

    fireEvent.click(screen.getByRole('button', { name: /提示 3\/3/u }));
    expect(screen.getByRole('complementary', { name: '已解锁提示' })).toHaveTextContent('这是歌词提示');
  });
});
