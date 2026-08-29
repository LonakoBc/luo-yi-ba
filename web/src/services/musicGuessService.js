import { MUSIC_GUESS_CLIP_MANIFEST } from '../data/musicGuessManifest';

const DEFAULT_API = 'https://api.i-meto.com/meting/api';
const DEFAULT_SERVER = 'netease';
const DEFAULT_PLAYLIST_ID = '18330761615';
const DEFAULT_CLIP_BASE_URL = 'https://8.217.219.36/media/music-guess/assets';

export const MUSIC_GUESS_CONFIG = Object.freeze({
  api: import.meta.env.VITE_MUSIC_GUESS_API || import.meta.env.VITE_BGM_API || DEFAULT_API,
  server: import.meta.env.VITE_MUSIC_GUESS_SERVER || DEFAULT_SERVER,
  type: 'playlist',
  id: import.meta.env.VITE_MUSIC_GUESS_PLAYLIST_ID || DEFAULT_PLAYLIST_ID,
  clipBaseUrl: import.meta.env.VITE_MUSIC_GUESS_CLIP_BASE_URL || DEFAULT_CLIP_BASE_URL,
});

export const MUSIC_GUESS_PLAYLISTS = Object.freeze([
  Object.freeze({
    id: 'luotianyi-netease-18330761615',
    title: '洛天依 · 287 首本地整理歌单',
    description: '本地整理 287 首曲目 · 网易云元数据 + 服务器 15 秒片段播放',
    source: 'netease-playlist',
    localFirst: true,
    neteasePlaylistId: DEFAULT_PLAYLIST_ID,
    url: `https://music.163.com/#/playlist?id=${DEFAULT_PLAYLIST_ID}`,
  }),
]);

export function getMusicGuessPlaylist(id) {
  return MUSIC_GUESS_PLAYLISTS.find((playlist) => playlist.id === id) ?? null;
}

export function buildMusicGuessPlaylistUrl(playlist, config = MUSIC_GUESS_CONFIG) {
  const params = new URLSearchParams({
    server: config.server,
    type: config.type,
    id: String(playlist?.neteasePlaylistId || config.id),
  });
  return `${config.api}?${params.toString()}`;
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\.mp3$/iu, '')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function normalizePlaylistSong(song, index) {
  if (!song || typeof song !== 'object') return null;
  const name = String(song.title || song.name || '').trim();
  if (!name) return null;
  return {
    id: String(song.id || `${name}-${index}`),
    name,
    artist: String(song.author || song.artist || '网易云音乐').trim(),
    cover: typeof song.pic === 'string' ? song.pic : '',
  };
}

function clipIndex(manifest) {
  return new Map(manifest.map((clip) => [normalizeTitle(clip.sourceName), clip]));
}

export function resolveMusicGuessClipUrl(fileName, config = MUSIC_GUESS_CONFIG) {
  if (!fileName) return '';
  return `${String(config.clipBaseUrl).replace(/\/+$/u, '')}/${encodeURIComponent(fileName)}`;
}

export function mapMusicGuessPlaylistTracks(songs, { manifest = MUSIC_GUESS_CLIP_MANIFEST, config = MUSIC_GUESS_CONFIG, localFirst = false } = {}) {
  const onlineSongs = songs.map(normalizePlaylistSong).filter(Boolean);
  if (!localFirst) {
    const clips = clipIndex(manifest);
    return onlineSongs
      .map((song) => {
        const clip = clips.get(normalizeTitle(song.name));
        if (!clip) return null;
        return {
          ...song,
          clipFileName: clip.fileName,
          clipUrl: resolveMusicGuessClipUrl(clip.fileName, config),
          clipDurationSeconds: clip.durationSeconds,
          source: 'aliyun-server',
        };
      })
      .filter(Boolean);
  }

  const onlineByTitle = new Map(onlineSongs.map((song) => [normalizeTitle(song.name), song]));
  return manifest
    .map((clip, index) => {
      const localTitle = String(clip.sourceName || '').replace(/\.mp3$/iu, '').trim();
      if (!localTitle || !clip.fileName) return null;
      const onlineSong = onlineByTitle.get(normalizeTitle(localTitle));
      const song = onlineSong ?? {
        id: `local-${index + 1}`,
        name: localTitle,
        artist: '洛天依',
        cover: '',
      };
      return {
        ...song,
        clipFileName: clip.fileName,
        clipUrl: resolveMusicGuessClipUrl(clip.fileName, config),
        clipDurationSeconds: clip.durationSeconds,
        source: 'aliyun-server',
        localOnly: !onlineSong,
      };
    })
    .filter(Boolean);
}

export async function fetchMusicGuessTracks(playlist, {
  config = MUSIC_GUESS_CONFIG,
  fetchImpl = globalThis.fetch,
  manifest = MUSIC_GUESS_CLIP_MANIFEST,
} = {}) {
  if (!playlist) throw new Error('猜曲歌单不存在');
  if (playlist.source !== 'netease-playlist') throw new Error('当前猜曲歌单未配置网易云数据源');
  const localFallback = () => {
    const tracks = mapMusicGuessPlaylistTracks([], { manifest, config, localFirst: true });
    if (tracks.length < 4) throw new Error(`本地清单中只有 ${tracks.length} 首服务器片段`);
    return tracks;
  };
  if (typeof fetchImpl !== 'function') {
    if (playlist.localFirst) return localFallback();
    throw new Error('当前环境不支持联网歌单');
  }

  let response;
  try {
    response = await fetchImpl(buildMusicGuessPlaylistUrl(playlist, config));
  } catch {
    if (playlist.localFirst) return localFallback();
    throw new Error('网易云歌单连接失败');
  }
  if (!response.ok) {
    if (playlist.localFirst) return localFallback();
    throw new Error(`网易云歌单加载失败（${response.status}）`);
  }

  let songs;
  try {
    songs = await response.json();
  } catch {
    if (playlist.localFirst) return localFallback();
    throw new Error('网易云歌单返回数据无效');
  }
  if (!Array.isArray(songs)) {
    if (playlist.localFirst) return localFallback();
    throw new Error('网易云歌单返回数据无效');
  }

  const tracks = mapMusicGuessPlaylistTracks(songs, { manifest, config, localFirst: playlist.localFirst });
  if (tracks.length < 4) throw new Error(`歌单中只有 ${tracks.length} 首歌曲匹配到服务器片段`);
  return tracks;
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function choose(items, random) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function createRound(number, answer, tracks, random) {
  const distractors = shuffle(tracks.filter((track) => track.id !== answer.id), random).slice(0, 3);
  return {
    number,
    answer,
    options: shuffle([answer, ...distractors], random),
    selectedId: null,
    outcome: null,
  };
}

export function musicGuessEvaluation(score, total) {
  if (score >= 50) return { title: '人形点歌机', description: '50 分以上，你已经把这份歌单的旋律刻进了耳朵。' };
  if (score >= 40) return { title: '歌单掌控者', description: '40 分以上，前奏刚响起，你就能稳稳锁定答案。' };
  if (score >= 30) return { title: '旋律猎手', description: '30 分以上，你对洛天依的经典旋律已经相当熟悉。' };
  if (score >= 20) return { title: '节奏追踪者', description: '20 分以上，你已经抓住了歌单里不少熟悉的瞬间。' };
  if (score >= 10) return { title: '初见成效', description: '10 分以上，耳朵索引正在建立，再来几轮会更顺手。' };
  return { title: '耳朵还在加载中', description: '先记住这些旋律，突破 10 分后就能听出更多答案。' };
}

export function createMusicGuessService(rawTracks, { random = Math.random } = {}) {
  const tracks = rawTracks.filter((track) => track && track.id && track.name && (track.clipUrl || track.url));
  if (tracks.length < 4) throw new Error('猜曲至少需要 4 首可播放歌曲');

  function startGame(forcedAnswerId = null) {
    const firstAnswer = tracks.find((track) => track.id === forcedAnswerId) ?? choose(tracks, random);
    return {
      status: 'playing',
      lives: 3,
      score: 0,
      round: createRound(1, firstAnswer, tracks, random),
      usedIds: [firstAnswer.id],
      failedIds: [],
      history: [],
    };
  }

  function chooseAnswer(game, selectedId) {
    if (game.status !== 'playing') return game;
    const { round } = game;
    if (!round.options.some((track) => track.id === selectedId)) return game;
    const correct = selectedId === round.answer.id;
    const lives = game.lives - (correct ? 0 : 1);
    const resolvedRound = { ...round, selectedId, outcome: correct ? 'correct' : 'wrong' };
    const status = lives === 0 ? 'lost' : game.usedIds.length >= tracks.length ? 'completed' : 'revealed';
    return {
      ...game,
      status,
      lives,
      score: game.score + (correct ? 1 : 0),
      round: resolvedRound,
      history: [...game.history, resolvedRound],
    };
  }

  function nextRound(game, forcedAnswerId = null) {
    if (game.status !== 'revealed') return game;
    const unused = tracks.filter((track) => !game.usedIds.includes(track.id) && !(game.failedIds ?? []).includes(track.id));
    const forcedAnswer = tracks.find((track) => track.id === forcedAnswerId);
    if (!unused.length && !forcedAnswer) return { ...game, status: 'completed' };
    const answer = forcedAnswer ?? choose(unused, random);
    return {
      ...game,
      status: 'playing',
      round: createRound(game.round.number + 1, answer, tracks, random),
      usedIds: game.usedIds.includes(answer.id) ? game.usedIds : [...game.usedIds, answer.id],
    };
  }

  function surrender(game) {
    if (['lost', 'settled', 'completed'].includes(game.status)) return game;
    if (game.status !== 'playing') return { ...game, status: 'settled' };
    const resolvedRound = { ...game.round, outcome: 'unanswered' };
    return { ...game, status: 'settled', round: resolvedRound, history: [...game.history, resolvedRound] };
  }

  return { tracks, startGame, chooseAnswer, nextRound, surrender };
}
