import { describe, expect, it, vi } from 'vitest';
import { buildPlaylistUrl, fetchBgmPlaylist } from './bgmService';

describe('联网 BGM 歌单服务', () => {
  it('按 Meting 参数构造网易云歌单请求地址', () => {
    expect(buildPlaylistUrl({ api: 'https://example.com/meting', server: 'netease', type: 'playlist', id: '123' }))
      .toBe('https://example.com/meting?server=netease&type=playlist&id=123');
  });

  it('将 Meting 歌曲字段转换成播放器统一格式，并过滤无播放地址的歌曲', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 1, title: '第一首', author: '歌手 A', url: 'https://cdn.example/1.mp3', pic: 'https://cdn.example/1.jpg', lrc: '[00:00]hi' },
        { id: 2, title: '无地址歌曲', author: '歌手 B', url: '' },
      ],
    });

    await expect(fetchBgmPlaylist({ fetchImpl, config: { api: 'https://example.com/meting', server: 'netease', type: 'playlist', id: '123' } }))
      .resolves.toEqual([{ id: '1', name: '第一首', artist: '歌手 A', url: 'https://cdn.example/1.mp3', cover: 'https://cdn.example/1.jpg', lyric: '[00:00]hi' }]);
  });

  it('在接口失败时返回可展示的错误', async () => {
    await expect(fetchBgmPlaylist({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) }))
      .rejects.toThrow('网易云歌单连接失败');
  });
});
