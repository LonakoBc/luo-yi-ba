import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MultiplayerPage, { CelebrationConfetti, GuessFeedbackTable, MultiplayerRoundResultDialog } from './MultiplayerPage';

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

it('本人和对手都显示七列字段反馈，但对手不显示具体歌曲文字', () => {
  const feedback = {
    isCorrect: false,
    title: { state: 'neutral' },
    staff: { state: 'exact', matches: ['甲'] },
    releaseMonth: { year: { state: 'near' }, month: { state: 'miss' }, direction: 'up' },
    singers: { state: 'partial', matches: [] }, voicebanks: { state: 'miss', matches: [] },
    concertCount: { state: 'near', direction: 'up' }, special: { state: 'miss' },
  };
  const own = { guesses: [{ song: songs[0], feedback, receivedAt: 1 }] };
  const opponent = { guesses: [{ index: 1, feedback, receivedAt: 1 }] };
  const { rerender } = render(<GuessFeedbackTable player={own} self />);
  expect(screen.getByRole('columnheader', { name: '曲名' })).toBeVisible();
  expect(screen.getByRole('columnheader', { name: '发布时间' })).toBeVisible();
  expect(screen.getByText('甲曲')).toBeVisible();
  rerender(<GuessFeedbackTable player={opponent} self={false} />);
  expect(screen.queryByText('甲曲')).not.toBeInTheDocument();
  expect(document.querySelector('.opponent-feedback-cell.exact')).toBeInTheDocument();
  expect(document.querySelectorAll('.opponent-feedback-cell.near').length).toBeGreaterThan(0);
});

it('结算彩带持续生成多组动画碎片', () => {
  render(<CelebrationConfetti />);
  expect(document.querySelectorAll('.celebration-confetti i')).toHaveLength(54);
  expect(document.querySelector('.celebration-confetti i')).toHaveStyle({ '--confetti-rise': '390px', '--confetti-fall': '120px' });
});

it('轮间结算弹窗展示完整答案、快捷链接、排名和下一轮倒计时', () => {
  const onClose = vi.fn();
  const answer = {
    ...songs[0],
    bilibiliUrl: 'https://www.bilibili.com/video/BV1test',
    vcpediaUrl: 'https://vcpedia.cn/song/test',
  };
  const players = [
    { id: 'p1', nickname: '玩家甲', roundScore: 3, joinOrder: 1 },
    { id: 'p2', nickname: '玩家乙', roundScore: 5, joinOrder: 2 },
  ];
  render(<MultiplayerRoundResultDialog answer={answer} players={players} nextRoundAt={11_000} now={1_000} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: '答案揭晓' })).toBeVisible();
  expect(screen.getByText(`《${answer.title}》`)).toBeVisible();
  expect(screen.getByText(answer.releaseMonth)).toBeVisible();
  expect(screen.getByText(answer.staffDisplay)).toBeVisible();
  expect(screen.getByText('1. 玩家乙')).toBeVisible();
  expect(screen.getByText('0:10')).toBeVisible();
  expect(screen.getByRole('link', { name: /Bilibili/ })).toHaveAttribute('href', answer.bilibiliUrl);
  expect(screen.getByRole('link', { name: /VCPedia/ })).toHaveAttribute('href', answer.vcpediaUrl);
  fireEvent.click(screen.getByRole('button', { name: '关闭本轮答案' }));
  expect(onClose).toHaveBeenCalledOnce();
});
