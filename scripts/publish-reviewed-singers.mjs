import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSingerCatalog, singerPaths } from './singer-config.mjs';

const FACT_FIELDS = [
  'title', 'staff', 'releaseMonth', 'singers', 'voicebanks', 'concertCount',
  'special', 'lyrics', 'bilibiliUrl', 'vcpediaUrl',
];

function canonicalPage(value) {
  return decodeURIComponent(new URL(value).pathname)
    .replace(/\/+$/u, '')
    .replaceAll('_', ' ')
    .normalize('NFKC');
}

function singerMembers(value) {
  return String(value).split('；').map((item) => item.trim()).filter(Boolean);
}

async function fileExists(file) {
  return access(file).then(() => true, () => false);
}

async function readOverrides(outputDirectory) {
  const file = path.join(outputDirectory, 'review-overrides.json');
  if (!await fileExists(file)) return {};
  return JSON.parse(await readFile(file, 'utf8'));
}

function validateSong(song, singer) {
  const missing = FACT_FIELDS.filter((field) => song[field] === undefined || song[field] === null || String(song[field]).trim() === '');
  if (missing.length) throw new Error(`《${song.title ?? '未知曲目'}》缺少字段：${missing.join('、')}`);
  if (FACT_FIELDS.some((field) => String(song[field]).includes('待核验'))) throw new Error(`《${song.title}》仍含待核验字段`);
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth)) throw new Error(`《${song.title}》发布时间无效`);
  if (!Number.isInteger(song.concertCount) || song.concertCount < 0) throw new Error(`《${song.title}》演唱会次数无效`);
  const acceptedNames = new Set([singer.name, ...(singer.aliases ?? [])]);
  if (!singerMembers(song.singers).some((name) => acceptedNames.has(name))) throw new Error(`《${song.title}》演唱歌姬不包含${singer.name}`);
  new URL(song.bilibiliUrl);
  new URL(song.vcpediaUrl);
}

export async function publishReviewedSingers(ids) {
  if (!ids.length) throw new Error('请至少指定一位歌姬');
  const catalog = await loadSingerCatalog();
  const targets = ids.map((id) => {
    const singer = catalog.singers.find((item) => item.id === id);
    if (!singer) throw new Error(`未知歌姬：${id}`);
    return singer;
  });
  const targetIds = new Set(ids);
  const canonicalSongs = new Map();

  for (const singer of catalog.singers) {
    if (targetIds.has(singer.id) || !singer.published) continue;
    const file = singerPaths(singer).reviewedData;
    if (!await fileExists(file)) continue;
    const songs = JSON.parse(await readFile(file, 'utf8'));
    for (const song of songs) {
      const key = canonicalPage(song.vcpediaUrl);
      if (!canonicalSongs.has(key)) canonicalSongs.set(key, song);
    }
  }

  const results = [];
  for (const singer of targets) {
    const paths = singerPaths(singer);
    const draftFile = path.join(paths.outputDir, 'database-draft.json');
    const draft = JSON.parse(await readFile(draftFile, 'utf8'));
    const overrides = await readOverrides(paths.outputDir);
    let synchronized = 0;
    const songs = draft.map((sourceSong) => {
      const overridden = { ...sourceSong, ...(overrides[sourceSong.title] ?? {}) };
      const canonical = canonicalSongs.get(canonicalPage(overridden.vcpediaUrl));
      const song = canonical
        ? Object.fromEntries(FACT_FIELDS.map((field) => [field, canonical[field]]))
        : Object.fromEntries(FACT_FIELDS.map((field) => [field, overridden[field]]));
      if (canonical) synchronized += 1;
      validateSong(song, singer);
      return song;
    });
    await writeFile(paths.reviewedData, `${JSON.stringify(songs, null, 2)}\n`, 'utf8');
    for (const song of songs) {
      const key = canonicalPage(song.vcpediaUrl);
      if (!canonicalSongs.has(key)) canonicalSongs.set(key, song);
    }
    results.push({ id: singer.id, count: songs.length, synchronized });
  }
  return results;
}

const ids = process.argv.find((value) => value.startsWith('--singers='))?.slice('--singers='.length).split(',').filter(Boolean) ?? [];
if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  const results = await publishReviewedSingers(ids);
  console.log(results.map(({ id, count, synchronized }) => `${id}: ${count} 首（同步 ${synchronized} 首）`).join('\n'));
}
