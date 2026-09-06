import { describe, expect, it } from 'vitest';
import {
  createMusicGuessPlaylist,
  createMusicGuessService,
  getMusicGuessPlaylistCount,
  getMusicGuessTracks,
  MUSIC_GUESS_GROUP_PLAYLISTS,
  MUSIC_GUESS_PLAYLISTS,
  musicGuessEvaluation,
  musicGuessLifeBonus,
  resolveMusicGuessClipUrl,
} from './musicGuessService';

const manifest = [
  { fileName: 'clip-001.mp3', sourceName: '甲曲.mp3', durationSeconds: 15, playlistIds: ['luotianyi'] },
  { fileName: 'clip-002.mp3', sourceName: '乙曲.mp3', durationSeconds: 15, playlistIds: ['yanhe'] },
  { fileName: 'clip-003.mp3', sourceName: '丙曲.mp3', durationSeconds: 15, playlistIds: ['luotianyi', 'yanhe'] },
  { fileName: 'clip-004.mp3', sourceName: '丁曲.mp3', durationSeconds: 15, playlistIds: ['wangchuan'] },
  { fileName: 'clip-005.mp3', sourceName: '戊曲.mp3', durationSeconds: 15, playlistIds: ['luotianyi'] },
  { fileName: 'clip-006.mp3', sourceName: '己曲.mp3', durationSeconds: 15, playlistIds: ['luotianyi'] },
];

const tracksForGame = manifest.map((clip) => ({
  id: clip.fileName,
  name: clip.sourceName.replace('.mp3', ''),
  clipUrl: 'https://media.example/' + clip.fileName,
}));

describe('本地曲库听歌识曲服务', () => {
  it('按本地 playlistIds 筛选曲目，并使用服务器片段地址', () => {
    const playlist = createMusicGuessPlaylist(['luotianyi']);
    const tracks = getMusicGuessTracks(playlist, {
      manifest,
      config: { clipBaseUrl: 'https://media.example/clips' },
    });
    expect(tracks.map((track) => track.name)).toEqual(['甲曲', '丙曲', '戊曲', '己曲']);
    expect(tracks[0]).toMatchObject({
      artist: '洛天依',
      clipFileName: 'clip-001.mp3',
      clipUrl: 'https://media.example/clips/clip-001.mp3',
      source: 'local-catalog',
    });
  });

  it('多个歌姬曲库取并集，重复 clipFile 只保留一条', () => {
    const playlist = createMusicGuessPlaylist(['luotianyi', 'yanhe']);
    const tracks = getMusicGuessTracks(playlist, { manifest, config: { clipBaseUrl: 'https://media.example' } });
    expect(playlist.id).toBe('custom');
    expect(tracks).toHaveLength(5);
    expect(new Set(tracks.map((track) => track.clipFileName)).size).toBe(5);
    expect(tracks.find((track) => track.name === '丙曲')).toBeTruthy();
  });

  it('快捷曲库包含 Vsinger、五维、忘川与全曲库', () => {
    expect(MUSIC_GUESS_GROUP_PLAYLISTS.map((playlist) => playlist.id)).toEqual(['vsinger', 'five-dimension', 'wangchuan', 'all']);
    expect(MUSIC_GUESS_PLAYLISTS.some((playlist) => playlist.id === 'luotianyi')).toBe(true);
  });

  it('快捷曲库和自定义曲库数量按唯一片段动态计算', () => {
    expect(getMusicGuessPlaylistCount(MUSIC_GUESS_GROUP_PLAYLISTS.find((playlist) => playlist.id === 'vsinger'), manifest)).toBe(5);
    expect(getMusicGuessPlaylistCount(['luotianyi'], manifest)).toBe(4);
    expect(getMusicGuessPlaylistCount(['luotianyi', 'yanhe'], manifest)).toBe(5);
  });

  it('没有本地命中时给出明确错误，不依赖网络请求', () => {
    expect(() => getMusicGuessTracks(createMusicGuessPlaylist(['luotianyi']), {
      manifest: [{ fileName: 'only.mp3', sourceName: '不存在.mp3', playlistIds: ['xinhua'] }],
    })).toThrow('只有 0 首可用歌曲');
  });

  it('正确生成片段 URL，并编码特殊文件名', () => {
    expect(resolveMusicGuessClipUrl('clip 01.mp3', { clipBaseUrl: 'https://media.example/clips/' }))
      .toBe('https://media.example/clips/clip%2001.mp3');
  });

  it('每题生成一个答案和三项乱序干扰项，答错会消耗生命', () => {
    const service = createMusicGuessService(tracksForGame, { random: () => 0 });
    const started = service.startGame();
    expect(started.round.options).toHaveLength(4);
    const wrong = started.round.options.find((track) => track.id !== started.round.answer.id);
    const afterWrong = service.chooseAnswer(started, wrong.id);
    expect(afterWrong.lives).toBe(2);
    expect(afterWrong.status).toBe('revealed');
  });

  it('允许管理员指定开局或下一题的音频，即使歌曲已经出现过', () => {
    const service = createMusicGuessService(tracksForGame, { random: () => 0 });
    const started = service.startGame('clip-003.mp3');
    expect(started.round.answer.id).toBe('clip-003.mp3');
    const next = service.nextRound({ ...started, status: 'revealed' }, 'clip-003.mp3');
    expect(next.round.answer.id).toBe('clip-003.mp3');
  });

  it('支持连续答题、投降和分数评价', () => {
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

  it('限时模式保留三条命，并在结算时按剩余生命给予 5/3/1 分奖励', () => {
    const service = createMusicGuessService(tracksForGame, { random: () => 0, mode: 'timed', durationSeconds: 60 });
    const started = service.startGame();
    expect(started).toMatchObject({ mode: 'timed', durationSeconds: 60, lives: 3, score: 0 });
    expect(service.timeUp(started)).toMatchObject({ status: 'time-up', score: 5, lifeBonus: 5 });

    const oneWrong = service.chooseAnswer(started, started.round.options.find((track) => track.id !== started.round.answer.id).id);
    expect(service.timeUp(oneWrong)).toMatchObject({ status: 'time-up', lives: 2, score: 3, lifeBonus: 3 });
    expect(musicGuessLifeBonus(1)).toBe(1);
    expect(musicGuessLifeBonus(0)).toBe(0);
    expect(musicGuessEvaluation(20, 287, { mode: 'timed', lifeBonus: 3 }).title).toBe('节奏追踪者');
  });

  it('限时模式答错三次后立即结算且没有生命奖励', () => {
    const service = createMusicGuessService(tracksForGame, { random: () => 0, mode: 'timed', durationSeconds: 300 });
    let game = service.startGame();
    for (let index = 0; index < 3; index += 1) {
      const wrong = game.round.options.find((track) => track.id !== game.round.answer.id);
      game = service.chooseAnswer(game, wrong.id);
      if (game.status === 'lost') break;
      game = service.nextRound(game);
    }
    expect(game).toMatchObject({ status: 'lost', lives: 0, score: 0, lifeBonus: 0 });
  });
});
