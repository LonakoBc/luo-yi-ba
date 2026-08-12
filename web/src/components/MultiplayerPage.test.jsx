import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MultiplayerPage from './MultiplayerPage';

const songs = [
  { id: 'a', title: '甲曲', releaseMonth: '2020-01', staffPeople: ['甲'], staffDisplay: '作曲：甲', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', lyrics: '甲歌词', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
  { id: 'b', title: '乙曲', releaseMonth: '2021-01', staffPeople: ['乙'], staffDisplay: '作曲：乙', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', lyrics: '乙歌词', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
  { id: 'c', title: '丙曲', releaseMonth: '2022-01', staffPeople: ['丙'], staffDisplay: '作曲：丙', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', lyrics: '丙歌词', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
];
const presets = [{ id: 'all', name: '全曲库', description: '全部', titles: songs.map(({ title }) => title) }];

afterEach(() => localStorage.clear());

it('联机入口校验昵称和六位房间码并进入创建配置', () => {
  const navigate = vi.fn();
  const { rerender } = render(<MultiplayerPage view="entry" code="ABC234" songs={songs} presets={presets} onNavigate={navigate} onBack={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('你的昵称'), { target: { value: '天依粉丝' } });
  expect(screen.getByRole('button', { name: '加入房间' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
  expect(navigate).toHaveBeenCalledWith('/multiplayer/create');
  rerender(<MultiplayerPage view="create" songs={songs} presets={presets} onNavigate={navigate} onBack={vi.fn()} />);
  expect(screen.getByText('2 人 · 1 轮')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '4 人' }));
  expect(screen.getByText('4 人 · 3 轮')).toBeVisible();
});
