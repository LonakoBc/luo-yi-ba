import { describe, expect, it, vi } from 'vitest';
import {
  buildMusicGuessPlaylistUrl,
  createMusicGuessService,
  fetchMusicGuessTracks,
  mapMusicGuessPlaylistTracks,
  MUSIC_GUESS_PLAYLISTS,
  musicGuessEvaluation,
  resolveMusicGuessClipUrl,
} from './musicGuessService';

const playlist = MUSIC_GUESS_PLAYLISTS[0];
const manifest = [
  { fileName: 'clip-001.mp3', sourceName: '甲曲.mp3', durationSeconds: 15 },
  { fileName: 'clip-002.mp3', sourceName: '乙曲.mp3', durationSeconds: 15 },
  { fileName: 'clip-003.mp3', sourceName: '丙曲.mp3', durationSeconds: 15 },
  { fileName: 'clip-004.mp3', sourceName: '丁曲.mp3', durationSeconds: 15 },
];

const songs = ['甲曲', '乙曲', '丙曲', '丁曲'].map((title, index) => ({
  id: 100 + index,
  title,
  author: '洛天依',
  url: 'https://api.i-meto.com/should-not-be-used.mp3',
  pic: 'https://example.com/' + index + '.jpg',
}));

describe('网易云元数据 + 服务器片段猜曲服务', () => {
  it('按网易云歌单 ID 构造 Meting 请求地址', () => {
    expect(buildMusicGuessPlaylistUrl(playlist, {
      api: 'https://example.com/meting',
      server: 'netease',
      type: 'playlist',
      id: 'ignored',
    })).toBe('https://example.com/meting?server=netease&type=playlist&id=18330761615');
  });

  it('将网易云歌曲映射到服务器片段，并忽略接口返回的在线音频地址', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => songs });
    const tracks = await fetchMusicGuessTracks(playlist, {
      fetchImpl,
      manifest,
      config: { api: 'https://example.com/meting', server: 'netease', type: 'playlist', id: playlist.neteasePlaylistId, clipBaseUrl: 'https://8.217.219.36/media/music-guess/clips' },
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/meting?server=netease&type=playlist&id=18330761615');
    expect(tracks[0]).toMatchObject({ id: '100', name: '甲曲', clipFileName: 'clip-001.mp3', clipUrl: 'https://8.217.219.36/media/music-guess/clips/clip-001.mp3', source: 'aliyun-server' });
    expect(tracks[0]).not.toHaveProperty('url');
  });

  it('匹配括号、空格、扩展名和结尾标点的轻微差异', () => {
    const tracks = mapMusicGuessPlaylistTracks([
      { id: 1, title: '心跳同步的时光-Memory Ver.', author: '歌手' },
    ], {
      manifest: [{ fileName: 'clip-026.mp3', sourceName: '心跳同步的时光-Memory Ver.mp3', durationSeconds: 15 }],
      config: { clipBaseUrl: 'https://media.example/clips' },
    });
    expect(tracks[0].clipUrl).toBe('https://media.example/clips/clip-026.mp3');
    expect(resolveMusicGuessClipUrl('clip 01.mp3', { clipBaseUrl: 'https://media.example/clips/' })).toContain('clip%2001.mp3');
  });

  it('接口失败或可匹配片段不足时返回可展示的错误', async () => {
    await expect(fetchMusicGuessTracks(playlist, { fetchImpl: vi.fn().mockRejectedValue(new Error('offline')), manifest }))
      .rejects.toThrow('网易云歌单连接失败');
    await expect(fetchMusicGuessTracks({ ...playlist, localFirst: false }, {
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => [{ title: '不存在的歌曲' }] }),
      manifest,
    })).rejects.toThrow('只有 0 首歌曲匹配到服务器片段');
  });

  it('每题生成一个答案和三项乱序干扰项，答错会消耗生命', () => {
    const tracksForGame = songs.map((song, index) => ({ id: String(song.id), name: song.title, artist: song.author, clipUrl: 'https://media.example/' + index + '.mp3' }));
    const service = createMusicGuessService(tracksForGame, { random: () => 0 });
    const started = service.startGame();
    expect(started.round.options).toHaveLength(4);
    const wrong = started.round.options.find((track) => track.id !== started.round.answer.id);
    const afterWrong = service.chooseAnswer(started, wrong.id);
    expect(afterWrong.lives).toBe(2);
    expect(afterWrong.status).toBe('revealed');
  });


  it('允许本地管理员指定开局或下一题的音频，即使歌曲已经出现过', () => {
    const tracksForGame = songs.map((song, index) => ({ id: String(song.id), name: song.title, clipUrl: 'https://media.example/' + index + '.mp3' }));
    const service = createMusicGuessService(tracksForGame, { random: () => 0 });
    const started = service.startGame('102');
    expect(started.round.answer.id).toBe('102');
    const revealed = { ...started, status: 'revealed' };
    const next = service.nextRound(revealed, '102');
    expect(next.round.answer.id).toBe('102');
  });
  it('支持连续答题、投降和分数评价', () => {
    const tracksForGame = songs.map((song, index) => ({ id: String(song.id), name: song.title, clipUrl: 'https://media.example/' + index + '.mp3' }));
    const service = createMusicGuessService(tracksForGame, { random: () => 0 });
    let game = service.startGame();
    let rounds = 1;
    while (game.status === 'playing' || game.status === 'revealed') {
      if (game.status === 'playing') game = service.chooseAnswer(game, game.round.answer.id);
      else {
        game = service.nextRound(game);
        rounds += 1;
      }
    }
    expect(rounds).toBe(tracksForGame.length);
    expect(game.status).toBe('completed');
    expect(musicGuessEvaluation(10, 287).title).toBe('初见成效');
    expect(musicGuessEvaluation(20, 287).title).toBe('节奏追踪者');
    expect(musicGuessEvaluation(30, 287).title).toBe('旋律猎手');
    expect(musicGuessEvaluation(40, 287).title).toBe('歌单掌控者');
    expect(musicGuessEvaluation(50, 287).title).toBe('人形点歌机');
    expect(service.surrender(service.startGame()).status).toBe('settled');
  });
});
