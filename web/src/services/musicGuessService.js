import { MUSIC_GUESS_CLIP_MANIFEST } from '../data/musicGuessManifest';

const DEFAULT_CLIP_BASE_URL = 'https://8.217.219.36/media/music-guess/assets';

export const MUSIC_GUESS_CONFIG = Object.freeze({
  clipBaseUrl: import.meta.env.VITE_MUSIC_GUESS_CLIP_BASE_URL || DEFAULT_CLIP_BASE_URL,
});

export const MUSIC_GUESS_TIME_LIMITS = Object.freeze([60, 180, 300]);

export function normalizeMusicGuessMode(mode = 'unlimited', durationSeconds = 0) {
  if (mode !== 'timed') return { mode: 'unlimited', durationSeconds: 0 };
  const duration = Number(durationSeconds);
  return {
    mode: 'timed',
    durationSeconds: MUSIC_GUESS_TIME_LIMITS.includes(duration) ? duration : MUSIC_GUESS_TIME_LIMITS[0],
  };
}

export function musicGuessLifeBonus(lives) {
  return [0, 1, 3, 5][Math.max(0, Math.min(3, Number(lives) || 0))];
}

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

const group = (id, title, description, playlistIds, icon, iconClass) => Object.freeze({
  id,
  title,
  description,
  icon,
  iconClass,
  source: 'local-catalog',
  playlistIds: Object.freeze(playlistIds.slice()),
});

export const MUSIC_GUESS_GROUP_PLAYLISTS = Object.freeze([
  group('vsinger', 'Vsinger 曲库', '洛天依、乐正绫、言和、乐正龙牙、墨清弦、徵羽摩柯曲库', VSINGER_IDS, 'V', 'vsinger'),
  group('five-dimension', '五维介质曲库', '星尘、海伊、赤羽、苍穹、诗岸、永夜Minus、牧心曲库', FIVE_DIMENSION_IDS, '✦', 'five-dimension'),
  group('wangchuan', '忘川风华录曲库', '忘川风华录企划相关曲库', ['wangchuan'], '☾', 'wangchuan'),
  group('all', '全曲库', '所有已整理歌姬与企划曲库', ALL_SINGER_IDS.concat(['wangchuan']), '✺', 'all'),
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

export function getMusicGuessPlaylistCount(selection, manifest = MUSIC_GUESS_CLIP_MANIFEST) {
  const ids = Array.isArray(selection) ? selection : selection?.playlistIds || [];
  const selectedIds = new Set(ids);
  const seenFiles = new Set();
  for (const clip of manifest) {
    const fileName = clip?.fileName || clip?.clipFile;
    if (!fileName || seenFiles.has(fileName)) continue;
    if ((clip.playlistIds || []).some((id) => selectedIds.has(id))) seenFiles.add(fileName);
  }
  return seenFiles.size;
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

export function musicGuessEvaluation(score, total, { mode = 'unlimited', lifeBonus = 0 } = {}) {
  if (mode === 'timed') {
    const bonusText = lifeBonus > 0 ? '另有 ' + lifeBonus + ' 分生命奖励，' : '';
    if (score >= 50) return { title: '限时点歌机', description: bonusText + '50 分以上，你在倒计时里依然稳定锁定旋律。' };
    if (score >= 40) return { title: '高速歌单掌控者', description: bonusText + '40 分以上，你把速度与准确度都拉满了。' };
    if (score >= 30) return { title: '旋律冲刺者', description: bonusText + '30 分以上，你在有限时间里抓住了大量熟悉的瞬间。' };
    if (score >= 20) return { title: '节奏追踪者', description: bonusText + '20 分以上，你已经逐渐适应限时猜曲的节奏。' };
    if (score >= 10) return { title: '限时初见成效', description: bonusText + '10 分以上，先稳住准确度，再把每一秒都用在找答案上。' };
    return { title: '先把节奏稳住', description: bonusText + '限时模式重在又快又准，再来一局熟悉倒计时的节奏吧。' };
  }
  if (score >= 50) return { title: '人形点歌机', description: '50 分以上，你已经把这份歌单的旋律刻进了耳朵。' };
  if (score >= 40) return { title: '歌单掌控者', description: '40 分以上，前奏刚响起，你就能稳稳锁定答案。' };
  if (score >= 30) return { title: '旋律猎手', description: '30 分以上，你对洛天依的经典旋律已经相当熟悉。' };
  if (score >= 20) return { title: '节奏追踪者', description: '20 分以上，你已经抓住了歌单里不少熟悉的瞬间。' };
  if (score >= 10) return { title: '初见成效', description: '10 分以上，耳朵索引正在建立，再来几轮会更顺手。' };
  return { title: '耳朵还在加载中', description: '先记住这些旋律，突破 10 分后就能听出更多答案。' };
}

export function createMusicGuessService(rawTracks, { random = Math.random, mode = 'unlimited', durationSeconds = 0 } = {}) {
  const tracks = rawTracks.filter((track) => track && track.id && track.name && (track.clipUrl || track.url));
  if (tracks.length < 4) throw new Error('猜曲至少需要 4 首可播放歌曲');
  const normalizedMode = normalizeMusicGuessMode(mode, durationSeconds);
  const timed = normalizedMode.mode === 'timed';

  function settle(game, status) {
    const lifeBonus = timed ? musicGuessLifeBonus(game.lives) : 0;
    return {
      ...game,
      status,
      lifeBonus,
      score: game.baseScore + lifeBonus,
      settled: true,
    };
  }

  function startGame(forcedAnswerId = null) {
    const firstAnswer = tracks.find((track) => track.id === forcedAnswerId) ?? choose(tracks, random);
    return {
      status: 'playing',
      mode: normalizedMode.mode,
      durationSeconds: normalizedMode.durationSeconds,
      lives: 3,
      baseScore: 0,
      lifeBonus: 0,
      score: 0,
      settled: false,
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
    const nextGame = {
      ...game,
      status,
      lives,
      baseScore: game.baseScore + (correct ? 1 : 0),
      score: game.baseScore + (correct ? 1 : 0),
      round: resolvedRound,
      history: [...game.history, resolvedRound],
    };
    return timed && ['lost', 'completed'].includes(status) ? settle(nextGame, status) : nextGame;
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
    if (game.status !== 'playing') return settle(game, 'settled');
    const resolvedRound = { ...game.round, outcome: 'unanswered' };
    return settle({ ...game, round: resolvedRound, history: [...game.history, resolvedRound] }, 'settled');
  }

  function timeUp(game) {
    if (['lost', 'settled', 'completed', 'time-up'].includes(game.status)) return game;
    if (game.status === 'playing') {
      const resolvedRound = { ...game.round, outcome: 'unanswered' };
      return settle({ ...game, round: resolvedRound, history: [...game.history, resolvedRound] }, 'time-up');
    }
    return settle(game, 'time-up');
  }

  return { tracks, startGame, chooseAnswer, nextRound, surrender, timeUp };
}
