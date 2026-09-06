/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MusicGuessLibraryPage from './MusicGuessLibraryPage';
import MusicGuessModePage from './MusicGuessModePage';
import MusicGuessPage from './MusicGuessPage';
import { MUSIC_GUESS_SINGER_PLAYLISTS } from '../services/musicGuessService';

const Brand = () => <div>洛一把</div>;
const playlist = MUSIC_GUESS_SINGER_PLAYLISTS[0];
const manifest = ['甲曲', '乙曲', '丙曲', '丁曲', '戊曲'].map((title, index) => ({
  fileName: 'clip-00' + (index + 1) + '.mp3',
  sourceName: title + '.mp3',
  durationSeconds: 15,
  playlistIds: index === 4 ? ['yanhe'] : ['luotianyi'],
}));

describe('本地曲库听歌识曲页面', () => {
  it('选项显示歌姬，三次跳过立即换音频且不扣生命，结算记录跳过', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const many = Array.from({ length: 10 }, (_, i) => ({ fileName: `clip-${i}.mp3`, sourceName: `歌曲${i}.mp3`, durationSeconds: 15, playlistIds: ['luotianyi', 'yanhe'] }));
    render(<MusicGuessPage playlist={playlist} manifest={many} random={() => 0} onBack={vi.fn()} Brand={Brand} />);
    await screen.findByRole('button', { name: '歌曲0 洛天依、言和' });
    for (let i = 3; i > 0; i--) {
      const before = document.querySelector('audio').src;
      fireEvent.click(screen.getByRole('button', { name: `跳过曲目（剩余 ${i} 次）` }));
      expect(document.querySelector('audio').src).not.toBe(before);
    }
    expect(screen.getByRole('button', { name: '跳过曲目（剩余 0 次）' })).toBeDisabled();
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('♥♥♥');
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('0得分');
    for (let i = 3; i < 8; i++) {
      fireEvent.click(screen.getByRole('button', { name: `歌曲${i} 洛天依、言和` }));
      if (i < 7) fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    }
    expect(screen.getByRole('status')).toHaveTextContent('生命 +1');
    expect(screen.getByLabelText('游戏状态')).toHaveTextContent('♥♥♥♥');
    fireEvent.click(screen.getByRole('button', { name: '投降并结算' }));
    fireEvent.click(screen.getByRole('button', { name: '确认投降' }));
    expect(screen.getAllByText('↷ 已跳过')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '再来一局' }));
    expect(screen.getByRole('button', { name: '跳过曲目（剩余 3 次）' })).toBeEnabled();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('歌单选择页提供快捷曲库和歌姬多选入口', () => {
    const onSelect = vi.fn();
    render(<MusicGuessLibraryPage onSelect={onSelect} onBack={vi.fn()} Brand={Brand} manifest={manifest} />);
    expect(screen.getByRole('heading', { name: '选择猜测歌单' })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Vsinger 曲库/u })).toHaveTextContent('5 首曲目');
    expect(screen.getByRole('button', { name: /全曲库/u })).toHaveTextContent('困难！！！');
    expect(screen.getByRole('complementary', { name: '歌单收集致谢' })).toHaveTextContent('若有词');
    expect(screen.getByRole('complementary', { name: '歌单收集致谢' })).toHaveTextContent('闻灯岚');
    fireEvent.click(screen.getByRole('button', { name: /Vsinger 曲库/u }));
    expect(onSelect).toHaveBeenCalledWith(['vsinger']);
    expect(screen.queryByRole('link', { name: /网易云/u })).toBeNull();
    fireEvent.click(screen.getByLabelText('言和'));
    expect(screen.getByText(/共 5 首曲目/u)).toBeVisible();
  });

  it('模式选择页提供限时三档与不限时入口', () => {
    const onChoose = vi.fn();
    render(<MusicGuessModePage onChoose={onChoose} onBack={vi.fn()} Brand={Brand} />);
    expect(screen.getByRole('heading', { name: '选择挑战模式' })).toBeVisible();
    expect(screen.getByRole('button', { name: '选择限时5分钟' })).not.toHaveTextContent('计入排行榜');
    fireEvent.click(screen.getByRole('button', { name: '选择限时5分钟' }));
    expect(onChoose).toHaveBeenCalledWith({ mode: 'timed', durationSeconds: 300 });
    fireEvent.click(screen.getByRole('button', { name: /不限时模式/u }));
    expect(onChoose).toHaveBeenLastCalledWith({ mode: 'unlimited', durationSeconds: 0 });
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
    fireEvent.click(screen.getByRole('button', { name: /重新播放猜曲片段/u }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '↻ 再次播放' }));
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(3));
    expect(screen.getByText('第 1 题 · 15 秒片段')).not.toBeNull();

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
    fireEvent.click(screen.getByRole('button', { name: '甲曲 洛天依' }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(document.querySelector('audio')?.getAttribute('src')).toContain('clip-003.mp3');
  });

  it('限时模式显示倒计时，并在时间到后结算生命奖励', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    render(<MusicGuessPage playlist={playlist} manifest={manifest} mode="timed" durationSeconds={60} random={() => 0} onBack={vi.fn()} Brand={Brand} />);
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.getByText('1:00')).toBeVisible();
    await vi.advanceTimersByTimeAsync(61000);
    expect(screen.getByRole('dialog', { name: '先把节奏稳住' })).toBeVisible();
    expect(screen.getByText('生命奖励').closest('span')).toHaveTextContent('5');
  });
});
