import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://vcpedia.cn/api.php';
const USER_AGENT = 'luo-yi-ba-image-index/1.0 (https://github.com/LonakoBc/luo-yi-ba)';
const BATCH_SIZE = 50;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogFile = path.join(root, 'database', 'catalog.json');
const outputFile = path.join(root, 'database', 'song-images.json');

function canonicalSongId(vcpediaUrl) {
  const url = new URL(vcpediaUrl);
  const page = decodeURIComponent(url.pathname)
    .replace(/^\/+|\/+$/gu, '')
    .replaceAll('_', ' ')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN');
  return `vcpedia:${page}`;
}

function pageTitle(vcpediaUrl) {
  return decodeURIComponent(new URL(vcpediaUrl).pathname)
    .replace(/^\/+|\/+$/gu, '')
    .replaceAll('_', ' ');
}

function normalizeTitle(value) {
  return String(value).replaceAll('_', ' ').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestBatch(titles, retries = 3) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'pageimages',
    piprop: 'thumbnail|original',
    pithumbsize: '800',
    titles: titles.join('|'),
  });

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1000);
    }
  }
  throw lastError;
}

async function loadSongs() {
  const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
  const songs = new Map();
  for (const entry of catalog) {
    const records = JSON.parse(await fs.readFile(path.join(root, 'database', entry.file), 'utf8'));
    for (const record of records) {
      const id = canonicalSongId(record.vcpediaUrl);
      if (!songs.has(id)) songs.set(id, { id, title: pageTitle(record.vcpediaUrl), pageUrl: record.vcpediaUrl });
    }
  }
  return [...songs.values()];
}

export async function refreshSongImages({ intervalMs = 1000, force = false } = {}) {
  const songs = await loadSongs();
  const existing = JSON.parse(await fs.readFile(outputFile, 'utf8').catch(() => '{"images":{}}'));
  const images = force ? {} : { ...(existing.images ?? {}) };
  const pending = songs.filter(({ id }) => !(id in images));

  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    const batch = pending.slice(offset, offset + BATCH_SIZE);
    if (offset > 0) await sleep(intervalMs);
    const data = await requestBatch(batch.map(({ title }) => title));
    const redirects = new Map((data.query?.redirects ?? []).map(({ from, to }) => [normalizeTitle(from), normalizeTitle(to)]));
    const pages = new Map((data.query?.pages ?? []).map((page) => [normalizeTitle(page.title), page]));

    for (const song of batch) {
      const requested = normalizeTitle(song.title);
      const page = pages.get(redirects.get(requested) ?? requested);
      images[song.id] = {
        pageUrl: song.pageUrl,
        thumbnailUrl: page?.thumbnail?.source ?? null,
        originalUrl: page?.original?.source ?? null,
      };
    }
    console.log(`已获取歌曲图片 ${Math.min(offset + batch.length, pending.length)} / ${pending.length}`);
  }

  const orderedImages = Object.fromEntries(songs.map(({ id }) => [id, images[id] ?? { pageUrl: null, thumbnailUrl: null, originalUrl: null }]));
  await fs.writeFile(outputFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'VCPedia MediaWiki pageimages API',
    images: orderedImages,
  }, null, 2)}\n`, 'utf8');
  return orderedImages;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const intervalArg = process.argv.find((value) => value.startsWith('--interval='));
  const intervalMs = intervalArg ? Number(intervalArg.split('=')[1]) : 1000;
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) throw new Error('请求间隔不得小于 1000ms');
  const images = await refreshSongImages({ intervalMs, force: process.argv.includes('--force') });
  const available = Object.values(images).filter(({ thumbnailUrl }) => thumbnailUrl).length;
  console.log(`歌曲图片清单已更新：${available} / ${Object.keys(images).length} 首有缩略图`);
}
