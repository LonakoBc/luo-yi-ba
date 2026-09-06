import { MUSIC_GUESS_CLIP_MANIFEST } from '../data/musicGuessManifest';
import songCoverManifest from '../data/songCovers.generated.json';
import characterImageManifest from '../data/characterImages.generated.json';

const SEARCH_LIMIT = 20;

export const COLLECTION_SLOT_DEFINITIONS = Object.freeze([
  ['first-heard', '听过的第一首', 'song'],
  ['entry-song', '入坑作', 'song'],
  ['favorite-single', '最爱单曲', 'song'],
  ['favorite-producer', '最爱P主', 'producer'],
  ['favorite-lyric', '最爱填词', 'song'],
  ['favorite-tuning', '最爱调教', 'song'],
  ['favorite-melody', '最爱旋律', 'song'],
  ['favorite-arrangement', '最爱编曲', 'song'],
  ['favorite-pv', '最爱PV', 'song'],
  ['unique-pv', '最独特PV', 'song'],
  ['favorite-concept', '最爱立意', 'song'],
  ['unique-concept', '最独特立意', 'song'],
  ['deep-concept', '最深立意', 'song'],
  ['satisfying-tuning', '最爽调教', 'song'],
  ['unique-tuning', '最独特调教', 'song'],
  ['controversial-liked', '争议大而你喜欢', 'song'],
  ['controversial-disliked', '争议大而你讨厌', 'song'],
  ['underrated', '被低估', 'song'],
  ['overrated', '被高估', 'song'],
  ['popular-indifferent', '热门但你无感', 'song'],
  ['favorite-meme', '最爱梗曲', 'song'],
  ['most-burning', '最燃', 'song'],
  ['favorite-singer', '最爱歌姬', 'singer'],
  ['singer-voice', '喜欢此歌姬声音', 'singer'],
  ['singer-image', '喜欢此歌姬形象', 'singer'],
  ['most-healing', '最治愈', 'song'],
  ['most-ice', '最冰', 'song'],
  ['most-ice-2', '最冰*2', 'song'],
  ['recommend-producer', '推荐一个P主吧', 'producer'],
  ['recommend-song', '推荐一首吧', 'song'],
].map(([id, label, type]) => Object.freeze({ id, label, type, maxItems: 3 })));

export const COLLECTION_STORAGE_KEY = 'luo-yi-ba-collection-draft-v1';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{S}\s]/gu, '');
}

const TOY_ASSET_PREFIXES = Object.freeze([
  ['/song-covers/', './song-cover-'],
  ['/character-images/singers/', './character-singer-'],
  ['/character-images/famous-producers/', './character-producer-'],
]);

function resolveCollectionAssetUrl(localUrl, fallback = '') {
  const value = String(localUrl || '');
  if (!value || import.meta.env.VITE_BUILD_TARGET !== 'toy') return value || fallback;
  const prefix = TOY_ASSET_PREFIXES.find(([source]) => value.startsWith(source));
  return prefix ? prefix[1] + value.slice(prefix[0].length) : value;
}

function displayTitle(clip) {
  return String(clip?.sourceName || clip?.fileName || clip?.sourceKey || '')
    .replace(/\.mp3$/iu, '')
    .replace(/^【[^】]*】/u, '')
    .trim();
}

function songSearchText(song) {
  return [song.title, song.slug, song.sourceName, song.singersDisplay, song.singerMembers?.join(' ')].filter(Boolean).join(' ');
}

export function buildCollectionSongPool(mainSongs = [], manifest = MUSIC_GUESS_CLIP_MANIFEST) {
  const songs = mainSongs.map((song) => ({ ...song, collectionKind: 'catalog' }));
  const byTitle = new Map();
  for (const song of songs) {
    const key = normalize(song.title);
    if (!key) continue;
    const matches = byTitle.get(key) ?? [];
    matches.push(song);
    byTitle.set(key, matches);
  }

  const supplemental = [];
  for (const clip of manifest) {
    const title = displayTitle(clip);
    const candidates = [title, clip?.sourceKey].map(normalize).filter(Boolean);
    const matches = candidates.flatMap((key) => byTitle.get(key) ?? []);
    const matched = [...new Map(matches.map((song) => [song.id, song])).values()];
    if (matched.length === 1) continue;
    if (!title) continue;
    supplemental.push({
      id: `collection-clip:${clip.fileName}`,
      title,
      slug: clip.sourceKey,
      sourceName: clip.sourceName,
      sourceLibraries: (clip.playlistIds ?? []).map((id) => ({ id, name: id })),
      singerMembers: [],
      singersDisplay: '',
      imageUrl: null,
      collectionKind: 'supplemental',
    });
  }
  return [...songs, ...supplemental];
}

export function searchCollectionSongs(songs, query, limit = SEARCH_LIMIT) {
  const key = normalize(query);
  if (!key) return [];
  return songs
    .filter((song) => normalize(songSearchText(song)).includes(key))
    .sort((left, right) => {
      const leftExact = normalize(left.title) === key;
      const rightExact = normalize(right.title) === key;
      if (leftExact !== rightExact) return leftExact ? -1 : 1;
      return left.title.localeCompare(right.title, 'zh-CN');
    })
    .slice(0, limit);
}

function collectionPersonKey(value) {
  return normalize(value).replace(/official$/u, '');
}

export function buildCollectionProducerPool(producers = [], songs = []) {
  const result = [];
  const byKey = new Map();
  const add = (producer) => {
    const key = collectionPersonKey(producer.name);
    if (!key || byKey.has(key)) return;
    const entry = { ...producer, collectionKind: producer.collectionKind || 'producer-database' };
    byKey.set(key, entry);
    result.push(entry);
  };
  producers.forEach(add);
  for (const song of songs) {
    for (const name of song.staffPeople || []) {
      const trimmed = String(name).trim();
      if (trimmed) add({ id: 'staff:' + collectionPersonKey(trimmed), name: trimmed, aliases: [], collectionKind: 'song-staff' });
    }
  }
  return result.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

export function buildCollectionSingerPool(singers = []) {
  return singers.filter((singer) => singer && singer.name).map((singer) => ({ ...singer, collectionKind: 'singer-database' }));
}
export function collectionSlotInitialState() {
  return Object.fromEntries(COLLECTION_SLOT_DEFINITIONS.map(({ id }) => [id, []]));
}

export function collectionEntryFromSong(song) {
  return {
    kind: 'song',
    id: song.id,
    title: song.title,
    coverUrl: resolveCollectionAssetUrl(songCoverManifest.covers?.[song.id]?.localUrl, song.imageUrl),
    singers: song.singersDisplay || song.singerMembers?.join('、') || '',
  };
}

export function collectionEntryFromProducer(producer) {
  return {
    kind: 'producer',
    id: producer.id,
    title: producer.name,
    coverUrl: resolveCollectionAssetUrl(characterImageManifest.characters?.['famous-producer:' + producer.id]?.localUrl, producer.imageUrl),
    singers: '',
  };
}

export function collectionEntryFromSinger(singer) {
  return {
    kind: 'singer',
    id: singer.id,
    title: singer.name,
    coverUrl: resolveCollectionAssetUrl(characterImageManifest.characters?.['singer:' + singer.id]?.localUrl, singer.imageUrl),
    singers: '',
  };
}

export function collectionEntryFromCustom(title, coverUrl = '', kind = 'song') {
  return {
    kind,
    id: `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    title: String(title).trim(),
    coverUrl,
    singers: '',
    custom: true,
  };
}

export function collectionShouldShowCover(entries) {
  return entries.length === 1 && Boolean(entries[0]?.coverUrl);
}
