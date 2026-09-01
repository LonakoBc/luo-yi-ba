/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MusicGuessLibraryPage from './MusicGuessLibraryPage';
import MusicGuessPage from './MusicGuessPage';
import { MUSIC_GUESS_SINGER_PLAYLISTS } from '../services/musicGuessService';

const Brand = () => <div>洛一把</div>;
const playlist = MUSIC_GUESS_SINGER_PLAYLISTS[0];
const manifest = ['甲曲', '乙曲', '丙曲', '丁曲'].map((title, index) => ({
  fileName: 'clip-00' + (index + 1) + '.mp3',
  sourceName: title + '.mp3',
  durationSeconds: 15,
  playlistIds: ['luotianyi'],
}));

describe('本地曲库听歌识曲页面', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('歌单选择页提供快捷曲库和歌姬多选入口', () => {
    const onSelect = vi.fn();
    render(<MusicGuessLibraryPage onSelect={onSelect} onBack={vi.fn()} Brand={Brand} />);
    expect(screen.getByRole('heading', { name: '选择猜测歌单' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Vsinger 曲库/u }));
    expect(onSelect).toHaveBeenCalledWith(['vsinger']);
    expect(screen.queryByRole('link', { name: /网易云/u })).toBeNull();
  });

  it('加载本地曲库后直接使用服务器 audio，不创建 Bilibili iframe，并自动播放', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    render(<MusicGuessPage playlist={playlist} manifest={manifest} random={() => 0} onBack={vi.fn()} Brand={Brand} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '听歌识曲' })).not.toBeNull());
    expect(document.querySelectorAll('.music-guess-option')).toHaveLength(4);
    expect(document.querySelector('audio')?.getAttribute('src')).toContain('clip-001.mp3');
    expect(document.querySelector('iframe')).toBeNull();
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /重新播放服务器猜曲片段/u }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '↻ 再次播放' }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3));
    expect(screen.getByText('第 1 题 · 服务器 15 秒片段')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '投降并结算' }));
    const confirm = screen.getByRole('dialog', { name: '现在投降并结算吗？' });
    fireEvent.click(within(confirm).getByRole('button', { name: '确认投降' }));
    expect(screen.getByRole('dialog', { name: '耳朵还在加载中' })).not.toBeNull();
  });

  it('开发环境提供管理员测试模式，可指定下一题音频', async () => {
    render(<MusicGuessPage playlist={playlist} manifest={manifest} random={() => 0} onBack={vi.fn()} Brand={Brand} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: '听歌识曲' })).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '管理员测试' }));
    fireEvent.change(screen.getByLabelText('指定下一题音频'), { target: { value: 'local-clip-003.mp3' } });
    fireEvent.click(screen.getByRole('button', { name: '设为下一题' }));
    expect(screen.getByRole('button', { name: '管理员测试' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '甲曲' }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(document.querySelector('audio')?.getAttribute('src')).toContain('clip-003.mp3');
  });
});
