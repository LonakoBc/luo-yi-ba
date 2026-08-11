import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadSingerCatalog, singerPaths } from './singer-config.mjs';

const SOURCE = path.join(ROOT, 'outputs', 'vcpedia-crawl', 'library-expansion-2026', 'songs.crawled.json');
const REPORT = path.join(ROOT, 'outputs', 'vcpedia-crawl', 'library-expansion-2026', 'merge-report.json');
const FACT_FIELDS = ['title', 'staff', 'releaseMonth', 'singers', 'voicebanks', 'concertCount', 'special', 'lyrics', 'bilibiliUrl', 'vcpediaUrl'];

function canonicalPage(value) {
  const url = new URL(value);
  return decodeURIComponent(url.pathname).replace(/^\/+|\/+$/gu, '').replaceAll('_', ' ').normalize('NFKC').toLocaleLowerCase('zh-CN');
}

function members(value) {
  return String(value ?? '').split('；').map((item) => item.trim()).filter(Boolean);
}

function facts(song) {
  return Object.fromEntries(FACT_FIELDS.map((field) => [field, song[field] ?? '']));
}

function compareSongs(left, right) {
  return left.releaseMonth.localeCompare(right.releaseMonth)
    || left.title.localeCompare(right.title, 'zh-CN');
}

export async function mergeLibraryExpansion() {
  const catalog = await loadSingerCatalog();
  const singerByName = new Map(catalog.singers.flatMap((singer) => [singer.name, ...(singer.aliases ?? [])].map((name) => [name, singer])));
  const libraries = new Map();
  for (const singer of catalog.singers.filter((item) => item.published)) {
    libraries.set(singer.id, JSON.parse(await readFile(singerPaths(singer).reviewedData, 'utf8')));
  }

  const crawled = JSON.parse(await readFile(SOURCE, 'utf8'));
  const changed = new Map();
  const unsupportedSingerNames = new Set();
  let updatedExisting = 0;
  let addedMemberships = 0;

  for (const sourceSong of crawled) {
    const song = facts(sourceSong);
    const key = canonicalPage(song.vcpediaUrl);
    let existed = false;
    for (const [singerId, songs] of libraries) {
      const index = songs.findIndex((item) => canonicalPage(item.vcpediaUrl) === key);
      if (index < 0) continue;
      songs[index] = song;
      changed.set(singerId, (changed.get(singerId) ?? 0) + 1);
      existed = true;
    }
    if (existed) updatedExisting += 1;

    for (const singerName of members(song.singers)) {
      const singer = singerByName.get(singerName);
      if (!singer?.published) {
        unsupportedSingerNames.add(singerName);
        continue;
      }
      const songs = libraries.get(singer.id);
      const index = songs.findIndex((item) => canonicalPage(item.vcpediaUrl) === key);
      if (index >= 0) {
        songs[index] = song;
      } else {
        songs.push(song);
        addedMemberships += 1;
      }
      changed.set(singer.id, (changed.get(singer.id) ?? 0) + 1);
    }
  }

  const singerResults = [];
  for (const singer of catalog.singers.filter((item) => item.published)) {
    const songs = libraries.get(singer.id).sort(compareSongs);
    const pages = new Set();
    const titles = new Set();
    for (const song of songs) {
      const page = canonicalPage(song.vcpediaUrl);
      const title = song.title.normalize('NFKC').toLocaleLowerCase('zh-CN');
      if (pages.has(page)) throw new Error(`${singer.name}重复页面：${song.vcpediaUrl}`);
      if (titles.has(title)) throw new Error(`${singer.name}重复曲名：${song.title}`);
      pages.add(page);
      titles.add(title);
    }
    await writeFile(singerPaths(singer).reviewedData, `${JSON.stringify(songs, null, 2)}\n`, 'utf8');
    singerResults.push({ id: singer.id, name: singer.name, count: songs.length, touched: changed.get(singer.id) ?? 0 });
  }

  const databaseCatalogPath = path.join(ROOT, 'database', 'catalog.json');
  const databaseCatalog = JSON.parse(await readFile(databaseCatalogPath, 'utf8'));
  for (const entry of databaseCatalog) {
    const result = singerResults.find((item) => item.id === entry.id);
    if (result) entry.expectedSongCount = result.count;
  }
  await writeFile(databaseCatalogPath, `${JSON.stringify(databaseCatalog, null, 2)}\n`, 'utf8');

  const allPages = new Set([...libraries.values()].flat().map((song) => canonicalPage(song.vcpediaUrl)));
  const report = {
    generatedAt: new Date().toISOString(),
    requestedSongs: crawled.length,
    newGlobalSongs: crawled.filter((song) => !song.preexisting).length,
    updatedExistingSongs: crawled.filter((song) => song.preexisting).length,
    matchedBeforeMerge: updatedExisting,
    addedMemberships,
    uniqueGlobalSongs: allPages.size,
    totalSingerRecords: singerResults.reduce((sum, item) => sum + item.count, 0),
    unsupportedSingerNames: [...unsupportedSingerNames],
    singers: singerResults,
  };
  await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) console.log(await mergeLibraryExpansion());
