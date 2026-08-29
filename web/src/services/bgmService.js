const DEFAULT_API = 'https://api.i-meto.com/meting/api';
const DEFAULT_SERVER = 'netease';
const DEFAULT_PLAYLIST_ID = '17973319129';

export const BGM_CONFIG = Object.freeze({
  api: import.meta.env.VITE_BGM_API || DEFAULT_API,
  server: import.meta.env.VITE_BGM_SERVER || DEFAULT_SERVER,
  type: 'playlist',
  id: import.meta.env.VITE_BGM_PLAYLIST_ID || DEFAULT_PLAYLIST_ID,
});

function normalizeSong(song, index) {
  if (!song || typeof song !== 'object' || typeof song.url !== 'string' || !song.url.trim()) return null;

  const title = String(song.title || song.name || `歌单歌曲 ${index + 1}`).trim();
  const artist = String(song.author || song.artist || '网易云音乐').trim();
  return {
    id: String(song.id || `${title}-${artist}-${index}`),
    name: title,
    artist,
    url: song.url.trim(),
    cover: typeof song.pic === 'string' ? song.pic : '',
    lyric: typeof song.lrc === 'string' ? song.lrc : '',
  };
}

export function buildPlaylistUrl(config = BGM_CONFIG) {
  const params = new URLSearchParams({ server: config.server, type: config.type, id: config.id });
  return `${config.api}?${params.toString()}`;
}

export async function fetchBgmPlaylist({ config = BGM_CONFIG, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持联网歌单');

  let response;
  try {
    response = await fetchImpl(buildPlaylistUrl(config));
  } catch {
    throw new Error('网易云歌单连接失败');
  }
  if (!response.ok) throw new Error(`网易云歌单加载失败（${response.status}）`);

  let songs;
  try {
    songs = await response.json();
  } catch {
    throw new Error('网易云歌单返回数据无效');
  }
  if (!Array.isArray(songs)) throw new Error('网易云歌单返回数据无效');

  const tracks = songs.map(normalizeSong).filter(Boolean);
  if (!tracks.length) throw new Error('网易云歌单中没有可播放歌曲');
  return tracks;
}
