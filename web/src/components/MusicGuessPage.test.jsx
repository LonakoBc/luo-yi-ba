import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MusicGuessLibraryPage from './MusicGuessLibraryPage';
import MusicGuessPage from './MusicGuessPage';
import { MUSIC_GUESS_PLAYLISTS } from '../services/musicGuessService';

const Brand = () => <div>洛一把</div>;
const playlist = MUSIC_GUESS_PLAYLISTS[0];
const songs = ['甲曲', '乙曲', '丙曲', '丁曲'].map((title, index) => ({
  id: 'song-' + index,
  title,
  author: '洛天依',
  url: 'https://api.i-meto.com/netease-online-audio.mp3',
}));
const manifest = [
  { fileName: 'clip-001.mp3', sourceName: '甲曲.mp3', durationSeconds: 15 },
  { fileName: 'clip-002.mp3', sourceName: '乙曲.mp3', durationSeconds: 15 },
  { fileName: 'clip-003.mp3', sourceName: '丙曲.mp3', durationSeconds: 15 },
  { fileName: 'clip-004.mp3', sourceName: '丁曲.mp3', durationSeconds: 15 },
];

describe('网易云元数据 + 服务器片段听歌识曲页面', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('歌单选择页提供进入游戏与网易云链接', () => {
    const onSelect = vi.fn();
    render(<MusicGuessLibraryPage playlists={[playlist]} onSelect={onSelect} onBack={vi.fn()} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: '选择歌单' }));
    expect(onSelect).toHaveBeenCalledWith(playlist.id);
    expect(screen.getByRole('link', { name: /网易云歌单（部分）/u })).toHaveAttribute('href', playlist.url);
  });

  it('加载歌单后使用服务器 audio，不创建 Bilibili iframe，并支持从零重播', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => songs });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    render(<MusicGuessPage playlist={playlist} fetchImpl={fetchImpl} manifest={manifest} random={() => 0} onBack={vi.fn()} Brand={Brand} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '听歌识曲' })).toBeVisible());
    expect(document.querySelectorAll('.music-guess-option')).toHaveLength(4);
    expect(document.querySelector('audio')).toHaveAttribute('src', expect.stringContaining('clip-001.mp3'));
    expect(document.querySelector('iframe')).not.toBeInTheDocument();

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /重新播放服务器猜曲片段/u }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '↻ 再次播放' }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3));
    expect(screen.getByText('第 1 题 · 服务器 15 秒片段')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '投降并结算' }));
    const confirm = screen.getByRole('dialog', { name: '现在投降并结算吗？' });
    fireEvent.click(within(confirm).getByRole('button', { name: '确认投降' }));
    expect(screen.getByRole('dialog', { name: '耳朵还在加载中' })).toBeVisible();
  });
  it('开发环境提供管理员测试模式，可指定下一题音频', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => songs });
    render(<MusicGuessPage playlist={playlist} fetchImpl={fetchImpl} manifest={manifest} random={() => 0} onBack={vi.fn()} Brand={Brand} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '听歌识曲' })).toBeVisible());

    fireEvent.click(screen.getByRole('button', { name: '管理员测试' }));
    fireEvent.change(screen.getByLabelText('指定下一题音频'), { target: { value: 'song-2' } });
    fireEvent.click(screen.getByRole('button', { name: '设为下一题' }));
    expect(screen.getByRole('button', { name: '管理员测试' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '甲曲' }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(document.querySelector('audio')).toHaveAttribute('src', expect.stringContaining('clip-003.mp3'));
  });
});
