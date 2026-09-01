import { MUSIC_GUESS_CLIP_MANIFEST } from '../data/musicGuessManifest';

const DEFAULT_CLIP_BASE_URL = 'https://8.217.219.36/media/music-guess/assets';

export const MUSIC_GUESS_CONFIG = Object.freeze({
  clipBaseUrl: import.meta.env.VITE_MUSIC_GUESS_CLIP_BASE_URL || DEFAULT_CLIP_BASE_URL,
});

const singer = (id, title, description) => Object.freeze({
  id,
  title,
  description: description || (title + '本地曲库'),
  source: 'local-catalog',
  playlistIds: Object.freeze([id]),
});

export const MUSIC_GUESS_SINGER_PLAYLISTS = Object.freeze([
  singer('luotianyi', '洛天依'),
  singer('yuezhengling', '乐正绫'),
  singer('yanhe', '言和'),
  singer('longya', '乐正龙牙'),
  singer('moqingxian', '墨清弦'),
  singer('zhiyu-moke', '徵羽摩柯'),
  singer('xinhua', '心华'),
  singer('xingchen', '星尘'),
  singer('haiyi', '海伊'),
  singer('cangqiong', '苍穹'),
  singer('chiyu', '赤羽'),
  singer('shian', '诗岸'),
  singer('yongye', '永夜Minus'),
  singer('muxing', '牧心'),
]);

const VSINGER_IDS = Object.freeze(['luotianyi', 'yuezhengling', 'yanhe', 'longya', 'moqingxian', 'zhiyu-moke']);
const FIVE_DIMENSION_IDS = Object.freeze(['xingchen', 'haiyi', 'chiyu', 'cangqiong', 'shian', 'yongye', 'muxing']);
const ALL_SINGER_IDS = Object.freeze(VSINGER_IDS.concat(['xinhua'], FIVE_DIMENSION_IDS));

const group = (id, title, description, playlistIds) => Object.freeze({
  id,
  title,
  description,
  source: 'local-catalog',
  playlistIds: Object.freeze(playlistIds.slice()),
});

export const MUSIC_GUESS_GROUP_PLAYLISTS = Object.freeze([
  group('vsinger', 'Vsinger 曲库', '洛天依、乐正绫、言和、乐正龙牙、墨清弦、徵羽摩柯曲库', VSINGER_IDS),
  group('five-dimension', '五维介质曲库', '星尘、海伊、赤羽、苍穹、诗岸、永夜Minus、牧心曲库', FIVE_DIMENSION_IDS),
  group('wangchuan', '忘川风华录曲库', '忘川风华录企划相关曲库', ['wangchuan']),
  group('all', '全曲库', '所有已整理歌姬与企划曲库', ALL_SINGER_IDS.concat(['wangchuan'])),
]);

export const MUSIC_GUESS_PLAYLISTS = Object.freeze([
  ...MUSIC_GUESS_GROUP_PLAYLISTS,
  ...MUSIC_GUESS_SINGER_PLAYLISTS,
]);

const PLAYLIST_BY_ID = new Map(MUSIC_GUESS_PLAYLISTS.map((playlist) => [playlist.id, playlist]));

export function createMusicGuessPlaylist(selectedIds = []) {
  const ids = [...new Set(selectedIds)].filter((id) => PLAYLIST_BY_ID.has(id));
  const playlistIds = [...new Set(ids.flatMap((id) => PLAYLIST_BY_ID.get(id).playlistIds))];
  if (!playlistIds.length) return null;
  return Object.freeze({
    id: ids.length === 1 ? ids[0] : 'custom',
    title: ids.length === 1 ? PLAYLIST_BY_ID.get(ids[0]).title : '自定义曲库组合',
    description: ids.length === 1 ? PLAYLIST_BY_ID.get(ids[0]).description : ('已选择 ' + ids.length + ' 个曲库，重复音频自动合并'),
    source: 'local-catalog',
    playlistIds: Object.freeze(playlistIds),
    selectedPlaylistIds: Object.freeze(ids),
  });
}

export function getMusicGuessPlaylist(id, includeIds = []) {
  if (id === 'custom') return createMusicGuessPlaylist(includeIds);
  return PLAYLIST_BY_ID.get(id) ?? null;
}

export function resolveMusicGuessClipUrl(fileName, config = MUSIC_GUESS_CONFIG) {
  if (!fileName) return '';
  return String(config.clipBaseUrl).replace(/\/+$/u, '') + '/' + encodeURIComponent(fileName);
}

function localTitle(clip) {
  return String(clip.sourceName || clip.fileName || '').replace(/\.mp3$/iu, '').trim();
}

export function getMusicGuessTracks(playlist, {
  manifest = MUSIC_GUESS_CLIP_MANIFEST,
  config = MUSIC_GUESS_CONFIG,
} = {}) {
  if (!playlist) throw new Error('猜曲歌单不存在');
  const selectedIds = new Set(playlist.playlistIds || []);
  const seenFiles = new Set();
  const tracks = manifest
    .filter((clip) => selectedIds.size > 0 && (clip.playlistIds || []).some((id) => selectedIds.has(id)))
    .filter((clip) => {
      const fileName = clip.fileName || clip.clipFile;
      if (!fileName || seenFiles.has(fileName)) return false;
      seenFiles.add(fileName);
      return true;
    })
    .map((clip, index) => {
      const fileName = clip.fileName || clip.clipFile;
      const name = localTitle(clip);
      if (!name) return null;
      return {
        id: 'local-' + (fileName || (index + 1)),
        name,
        artist: '本地曲库',
        cover: '',
        clipFileName: fileName,
        clipUrl: resolveMusicGuessClipUrl(fileName, config),
        clipDurationSeconds: clip.durationSeconds,
        source: 'local-catalog',
      };
    })
    .filter(Boolean);
  if (tracks.length < 4) throw new Error('当前曲库只有 ' + tracks.length + ' 首可用歌曲，至少需要 4 首');
  return tracks;
}

export const fetchMusicGuessTracks = getMusicGuessTracks;

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
