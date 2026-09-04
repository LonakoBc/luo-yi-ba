import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MultiplayerPage, { CelebrationConfetti, GuessFeedbackTable, MultiplayerRoundResultDialog, PlayerCard, PlayerColorMarker, PlayerColorPicker, serverClockOffset, songGuessIds } from './MultiplayerPage';
import MultiplayerSeniorityGame from './MultiplayerSeniorityGame';
import MultiplayerSortingGame from './MultiplayerSortingGame';
import { MultiplayerEmotePicker, MultiplayerEmotePopups } from './MultiplayerEmotes';

const songs = [
  { id: 'a', title: '甲曲', releaseMonth: '2020-01', staffPeople: ['甲'], staffDisplay: '作曲：甲', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', lyrics: '甲歌词', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
  { id: 'b', title: '乙曲', releaseMonth: '2021-01', staffPeople: ['乙'], staffDisplay: '作曲：乙', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', lyrics: '乙歌词', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
  { id: 'c', title: '丙曲', releaseMonth: '2022-01', staffPeople: ['丙'], staffDisplay: '作曲：丙', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', lyrics: '丙歌词', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
];
const presets = [
  { id: 'all', name: '全曲库', description: '全部', titles: songs.map(({ title }) => title) },
  { id: 'henian', name: '禾念系', description: '禾念', titles: songs.map(({ title }) => title) },
  { id: 'medium5', name: '五维介质系', description: '五维', titles: songs.map(({ title }) => title) },
  { id: 'luotianyi', name: '洛天依经典曲目', description: '洛天依', titles: songs.map(({ title }) => title) },
];

afterEach(() => localStorage.clear());

it('表情面板展示完整 28 张并发送稳定的表情 ID', () => {
  const onSend = vi.fn();
  const { rerender } = render(<MultiplayerEmotePicker onSend={onSend} />);
  fireEvent.click(screen.getByRole('button', { name: '打开表情' }));
  expect(screen.getByRole('region', { name: '联机表情' })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /发送/u })).toHaveLength(28);
  fireEvent.click(screen.getByRole('button', { name: '发送洛天依一发入魂表情' }));
  expect(onSend).toHaveBeenCalledWith('luotianyi-hit');
  rerender(<MultiplayerEmotePopups popups={[{ key: 'p1:1', playerId: 'p1', emoteId: 'luotianyi-hit', sentAt: 1 }]} players={[{ id: 'p1', nickname: '天依粉丝', color: { color: '#66CCFF' } }]} selfId="p1" />);
  expect(screen.getByAltText('天依粉丝发送了一发入魂表情')).toBeVisible();
  expect(screen.getByText('天依粉丝（你）')).toBeVisible();
});

it('联机入口校验昵称和六位房间码并按玩法进入创建配置', () => {
  const navigate = vi.fn();
  const { rerender } = render(<MultiplayerPage view="entry" code="ABC234" songs={songs} presets={presets} onNavigate={navigate} onBack={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('你的昵称'), { target: { value: '天依粉丝' } });
  expect(screen.getByRole('button', { name: '加入房间' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
  expect(navigate).toHaveBeenCalledWith('/multiplayer/create?mode=party');
  rerender(<MultiplayerPage view="create" mode="party" songs={songs} presets={presets} onNavigate={navigate} onBack={vi.fn()} />);
  expect(screen.getByRole('heading', { name: '创建多人房间' })).toBeVisible();
  expect(screen.getByText(/当前赛程 · 3 个玩法 · 3 轮/u)).toBeVisible();
  expect(screen.getByText(/至少选择 3 个不同玩法/u)).toBeVisible();
  rerender(<MultiplayerPage view="create" mode="guess-song" songs={songs} presets={presets} onNavigate={navigate} onBack={vi.fn()} />);
  expect(screen.getByText(/曲目猜猜看 · 2 人 · 1 轮/u)).toBeVisible();
  expect(screen.getByRole('button', { name: '3 轮' })).toBeVisible();
});

it('加入房间列的水友群提示只复制群号并显示成功提示', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<MultiplayerPage view="entry" songs={songs} presets={presets} onNavigate={vi.fn()} onBack={vi.fn()} />);
  expect(screen.getByText(/输入你的昵称/u)).toBeVisible();
  expect(screen.getByText(/填写房间码/u)).toBeVisible();
  expect(screen.getByRole('button', { name: '创建房间' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '复制联机水友 QQ 群号' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('1087737854'));
  expect(screen.getByRole('status')).toHaveTextContent('已复制群号！');
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

it('玩家选择的颜色会用于色标和答题卡', () => {
  const player = {
    id: 'p1', nickname: '玩家甲', seatIndex: 0, colorId: 'chiyu',
    color: { id: 'chiyu', singerName: '赤羽', colorName: '赤羽红', color: '#EE6666' },
    online: true, score: 5, roundScore: 0, solved: false, guesses: [],
  };
  const { rerender } = render(<PlayerColorMarker player={player} />);
  expect(screen.getByLabelText('赤羽红')).toHaveStyle({ '--player-color': '#EE6666' });
  rerender(<PlayerCard player={player} self />);
  expect(screen.getByText('玩家甲（你）')).toBeVisible();
  expect(screen.getByText('在线 · 赤羽红')).toBeVisible();
});

it('等待阶段可选择未占用歌姬色，实际色值相同时一起禁用', () => {
  const onSelect = vi.fn();
  const self = { id: 'p1', seatIndex: 0, colorId: 'luotianyi', color: { id: 'luotianyi', singerName: '洛天依', colorName: '天依蓝', color: '#66CCFF' } };
  const opponent = { id: 'p2', seatIndex: 1, colorId: 'xingchen', color: { id: 'xingchen', singerName: '星尘', colorName: '星尘紫', color: '#9999FF' } };
  render(<PlayerColorPicker room={{ players: [self, opponent] }} self={self} onSelect={onSelect} />);
  expect(screen.getByTitle('星尘紫已被占用')).toBeDisabled();
  expect(screen.getByTitle('选择苍穹绿')).not.toBeDisabled();
  expect(screen.getByLabelText('苍穹绿')).toHaveStyle({ '--player-color': '#66CC99' });
  fireEvent.click(screen.getByTitle('选择赤羽红'));
  expect(onSelect).toHaveBeenCalledWith('chiyu');
});

it('等待阶段的颜色选择默认折叠，点击摘要后展开', () => {
  const self = { id: 'p1', seatIndex: 0, colorId: 'luotianyi', color: { id: 'luotianyi', singerName: '洛天依', colorName: '天依蓝', color: '#66CCFF' } };
  const { container } = render(<PlayerColorPicker room={{ players: [self] }} self={self} onSelect={vi.fn()} />);
  const picker = container.querySelector('.player-color-picker');
  expect(picker).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('选择你的玩家颜色'));
  expect(picker).toHaveAttribute('open');
});

it('派对猜P主的猜测结构不会被当作歌曲读取', () => {
  const ids = songGuessIds({ guesses: [{ producer: { id: 'producer-1' }, feedback: {} }] });
  expect([...ids]).toEqual([]);
  expect([...songGuessIds({ guesses: [{ song: { id: 'song-1' } }] })]).toEqual(['song-1']);
});

it('派对听歌识曲曲库将预设与歌姬选择分组并互斥', () => {
  render(<MultiplayerPage view="create" mode="party" songs={songs} presets={presets} onNavigate={vi.fn()} onBack={vi.fn()} />);
  const stageButton = screen.getAllByRole('button').find((button) => button.className.includes('party-stage-toggle') && button.textContent.includes('听歌识曲'));
  fireEvent.click(stageButton);
  fireEvent.click(screen.getByText('独立曲库：听歌识曲'));
  expect(screen.getByText('预设曲库（单选）')).toBeVisible();
  expect(screen.getByText('歌姬曲库（可多选，取并集）')).toBeVisible();
  const all = screen.getByRole('button', { name: '全曲库' });
  const singer = screen.getByRole('button', { name: '洛天依' });
  fireEvent.click(singer);
  expect(singer).toHaveAttribute('aria-pressed', 'true');
  expect(all).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Vsinger 曲库' }));
  expect(screen.getByRole('button', { name: 'Vsinger 曲库' })).toHaveAttribute('aria-pressed', 'true');
  expect(singer).toHaveAttribute('aria-pressed', 'false');
});

it('派对加入曲名填字后主曲库仅保留三种填字预设且不再显示独立曲库', () => {
  render(<MultiplayerPage view="create" mode="party" songs={songs} presets={presets} onNavigate={vi.fn()} onBack={vi.fn()} />);
  const stageButton = screen.getAllByRole('button').find((button) => button.className.includes('party-stage-toggle') && button.textContent.includes('曲名填字'));
  fireEvent.click(stageButton);
  expect(screen.getByText(/曲名填字跟随主曲库/u)).toBeVisible();
  expect(screen.queryByText('独立曲库：曲名填字')).not.toBeInTheDocument();
  expect(screen.queryByText('自定义筛选')).not.toBeInTheDocument();
  const select = screen.getByLabelText('选择预设');
  expect([...select.options].map(({ value }) => value)).toEqual(['all', 'henian', 'medium5']);
});

it('单模式听歌识曲仍允许按原规则组合曲库', () => {
  render(<MultiplayerPage view="create" mode="music-guess" songs={songs} presets={presets} onNavigate={vi.fn()} onBack={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '洛天依' }));
  expect(screen.getByRole('button', { name: '全曲库' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '洛天依' })).toHaveAttribute('aria-pressed', 'true');
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
    { id: 'p1', nickname: '玩家甲', roundScore: 3, joinOrder: 0, seatIndex: 0 },
    { id: 'p2', nickname: '玩家乙', roundScore: 5, joinOrder: 1, seatIndex: 1 },
  ];
  render(<MultiplayerRoundResultDialog answer={answer} players={players} nextRoundAt={11_000} now={1_000} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: '答案揭晓' })).toBeVisible();
  expect(screen.getByText(`《${answer.title}》`)).toBeVisible();
  expect(screen.getByText(answer.releaseMonth)).toBeVisible();
  expect(screen.getByText(answer.staffDisplay)).toBeVisible();
  expect(screen.getByText('玩家乙')).toBeVisible();
  expect(screen.getByLabelText('乐正绫红')).toBeVisible();
  expect(screen.getByText('0:10')).toBeVisible();
  expect(screen.getByRole('link', { name: /Bilibili/ })).toHaveAttribute('href', answer.bilibiliUrl);
  expect(screen.getByRole('link', { name: /VCPedia/ })).toHaveAttribute('href', answer.vcpediaUrl);
  fireEvent.click(screen.getByRole('button', { name: '关闭本轮答案' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it('联机老资历在作答前隐藏日期，选择锁定后于揭晓阶段显示玩家落点', () => {
  const send = vi.fn();
  const players = [
    { id: 'p1', nickname: '玩家甲', color: { color: '#66CCFF', colorName: '天依蓝' }, score: 0, roundScore: 0, answered: false, choiceId: null, correct: null },
    { id: 'p2', nickname: '玩家乙', color: { color: '#EE0000', colorName: '乐正绫红' }, score: 0, roundScore: 0, answered: false, choiceId: null, correct: null },
  ];
  const baseRoom = {
    phase: 'playing', roundNumber: 1, roundCount: 5, endsAt: 13_000, nextRoundAt: null,
    seniorityRound: { difficulty: { label: '跨年入门' }, correctId: null, left: songs[0], right: songs[1] },
    players,
  };
  const { rerender } = render(<MultiplayerSeniorityGame room={baseRoom} self={players[0]} now={1_000} connection="online" send={send} />);
  expect(screen.getAllByText('发布时间：????-??')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '选择《甲曲》作为更早发布的歌曲' }));
  expect(send).toHaveBeenCalledWith({ type: 'submit_seniority_choice', songId: 'a' });

  const revealedPlayers = [
    { ...players[0], answered: true, choiceId: 'a', correct: true, roundScore: 5 },
    { ...players[1], answered: true, choiceId: 'b', correct: false, roundScore: 0 },
  ];
  rerender(<MultiplayerSeniorityGame room={{ ...baseRoom, phase: 'round-result', nextRoundAt: 5_000, seniorityRound: { ...baseRoom.seniorityRound, correctId: 'a' }, players: revealedPlayers }} self={revealedPlayers[0]} now={1_000} connection="online" send={send} />);
  expect(screen.getByText('发布时间：2020-01')).toBeVisible();
  expect(screen.getByText('✓ 更早发布')).toBeVisible();
  expect(screen.getByText('正确 +5')).toBeVisible();
  expect(screen.getByText('错误 +0')).toBeVisible();
});

it('联机排序只公开对手进度，提交后在揭晓阶段显示正确时间线与得分', () => {
  const send = vi.fn();
  const sortingSongs = [...songs, { ...songs[0], id: 'd', title: '丁曲', releaseMonth: '2023-01' }, { ...songs[0], id: 'e', title: '戊曲', releaseMonth: '2024-01' }];
  const orderIds = sortingSongs.map(({ id }) => id);
  const players = [
    { id: 'p1', nickname: '玩家甲', color: { color: '#66CCFF' }, moveCount: 0, submitted: false, orderIds, score: 0, roundScore: 0 },
    { id: 'p2', nickname: '玩家乙', color: { color: '#EE0000' }, moveCount: 2, submitted: false, orderIds: null, score: 0, roundScore: 0 },
  ];
  const room = { phase: 'playing', roundNumber: 1, roundCount: 3, endsAt: 61_000, nextRoundAt: null, players, sortingRound: { songs: sortingSongs.map((song) => ({ ...song, releaseMonth: null })), answerIds: null } };
  const { rerender } = render(<MultiplayerSortingGame room={room} self={players[0]} now={1_000} connection="online" send={send} />);
  expect(screen.getByText('调整 2 次')).toBeVisible();
  expect(screen.queryByText('2020-01')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '将《甲曲》下移' }));
  expect(send).toHaveBeenCalledWith({ type: 'update_sorting_order', orderIds: ['b', 'a', 'c', 'd', 'e'] });
  fireEvent.click(screen.getByRole('button', { name: '提交排序' }));
  expect(send).toHaveBeenLastCalledWith({ type: 'submit_sorting_order', orderIds: ['b', 'a', 'c', 'd', 'e'] });

  const revealedPlayers = players.map((player, index) => ({ ...player, submitted: true, orderIds, correctPairs: index ? 8 : 10, totalPairs: 10, percentage: index ? 80 : 100, roundScore: index ? 3 : 5 }));
  rerender(<MultiplayerSortingGame room={{ ...room, phase: 'round-result', nextRoundAt: 11_000, players: revealedPlayers, sortingRound: { songs: sortingSongs, answerIds: orderIds } }} self={revealedPlayers[0]} now={1_000} connection="online" send={send} />);
  expect(screen.getByText('正确时间线')).toBeVisible();
  expect(screen.getByText('10/10 · 100% · +5')).toBeVisible();
  expect(screen.getByText('8/10 · 80% · +3')).toBeVisible();
  expect(screen.getByText('2020-01')).toBeVisible();
});

it('使用服务端时间校准倒计时，避免客户端时钟偏差导致提前跳转', () => {
  expect(serverClockOffset(10_000, 7_000)).toBe(3_000);
  expect(serverClockOffset(10_000, 12_000)).toBe(-2_000);
  expect(serverClockOffset(undefined, 7_000)).toBe(0);
});

it('歌曲排序切换到题目完全不同的下一轮时立即使用新一轮顺序', () => {
  const send = vi.fn();
  const firstSongs = [0, 1, 2, 3, 4].map((index) => ({ ...songs[0], id: `first-${index}`, title: `首轮${index}` }));
  const secondSongs = [0, 1, 2, 3, 4].map((index) => ({ ...songs[0], id: `second-${index}`, title: `次轮${index}` }));
  const firstIds = firstSongs.map(({ id }) => id);
  const secondIds = secondSongs.map(({ id }) => id);
  const player = { id: 'p1', nickname: '玩家甲', color: { color: '#66CCFF' }, moveCount: 0, submitted: false, score: 0, roundScore: 0 };
  const room = (roundNumber, roundSongs, orderIds) => ({
    phase: 'playing', roundNumber, roundCount: 3, endsAt: 61_000, nextRoundAt: null,
    players: [{ ...player, orderIds }], sortingRound: { songs: roundSongs, answerIds: null },
  });
  const { rerender } = render(<MultiplayerSortingGame room={room(1, firstSongs, firstIds)} self={{ ...player, orderIds: firstIds }} now={1_000} connection="online" send={send} />);
  expect(screen.getByText('《首轮0》')).toBeVisible();

  expect(() => rerender(<MultiplayerSortingGame room={room(2, secondSongs, secondIds)} self={{ ...player, orderIds: secondIds }} now={1_000} connection="online" send={send} />)).not.toThrow();
  expect(screen.getByText('《次轮0》')).toBeVisible();
  expect(screen.queryByText('《首轮0》')).not.toBeInTheDocument();
});
