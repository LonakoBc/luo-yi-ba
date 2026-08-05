import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import { VCPEDIA_API_URL, extractBilibiliUrl } from './vcpedia-lib.mjs';
import { loadSingerConfig, singerIdFromArgs, singerPaths } from './singer-config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKC').replaceAll('_', ' ').trim().toLocaleLowerCase('zh-CN');
}

export { extractBilibiliUrl };

function pageContent(page) {
  return page?.revisions?.[0]?.slots?.main?.content ?? '';
}

async function readExistingDetailCache(cacheDir) {
  const pages = new Map();
  const entries = await readdir(cacheDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/^details-.*\.json$/u.test(entry.name)) continue;
    const data = JSON.parse(await readFile(path.join(cacheDir, entry.name), 'utf8'));
    for (const page of data.query?.pages ?? []) pages.set(normalizeTitle(page.title), pageContent(page));
  }
  return pages;
}

function apiUrl(title) {
  const url = new URL(VCPEDIA_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'content');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('titles', title);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('maxlag', '5');
  return url.href;
}

function pageTitleFromUrl(pageUrl) {
  return decodeURIComponent(new URL(pageUrl).pathname.replace(/^\/(?:zh-(?:hans|cn)\/)?/u, '')).replaceAll('_', ' ');
}

function cacheKey(value) {
  return `bilibili-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

export async function collectBilibiliLinks({ songs, sources, requestDelayMs = 1000, detailCacheDir, linkCacheDir }) {
  const sourceByTitle = new Map(sources.map((row) => [normalizeTitle(row['曲名']), row]));
  const cachedPages = await readExistingDetailCache(detailCacheDir ?? path.join(ROOT, '.cache', 'vcpedia'));
  const fetcher = new PoliteFetcher({
    cacheDir: linkCacheDir ?? path.join(ROOT, '.cache', 'vcpedia-bilibili'),
    minDelayMs: requestDelayMs,
  });
  const results = [];

  for (const [index, song] of songs.entries()) {
    const source = sourceByTitle.get(normalizeTitle(song['曲名']));
    const pageUrl = source?.['歌曲页面 URL'];
    if (!pageUrl) {
      results.push({ title: song['曲名'], pageUrl: '', bilibiliUrl: '', status: '缺少歌曲页面 URL' });
      continue;
    }
    const pageTitle = pageTitleFromUrl(pageUrl);
    let wikitext = cachedPages.get(normalizeTitle(pageTitle));
    let cacheStatus = 'VCPedia 详情缓存';
    if (!wikitext) {
      console.log(`[补抓 ${index + 1}/${songs.length}] ${song['曲名']}`);
      const data = await fetcher.requestJson({ url: apiUrl(pageTitle), cacheKey: cacheKey(pageUrl) });
      const page = data.query?.pages?.find((item) => !item.missing);
      wikitext = pageContent(page);
      cacheStatus = 'VCPedia API';
    }
    const bilibiliUrl = extractBilibiliUrl(wikitext);
    results.push({
      title: song['曲名'],
      pageUrl,
      bilibiliUrl: bilibiliUrl ?? '',
      status: bilibiliUrl ? cacheStatus : '未识别到原版 Bilibili 视频',
    });
  }
  return results;
}

async function main() {
  const singer = await loadSingerConfig(singerIdFromArgs());
  const paths = singerPaths(singer);
  const rawArgs = process.argv.slice(2);
  const positional = rawArgs.filter((value, index) => !value.startsWith('--') && rawArgs[index - 1] !== '--singer');
  const reviewDataPath = path.resolve(positional[0] ?? path.join(ROOT, '.codex-spreadsheet', `${singer.id}-review-data.json`));
  const outputPath = path.resolve(positional[1] ?? path.join(paths.outputDir, 'bilibili-links.json'));
  const review = JSON.parse(await readFile(reviewDataPath, 'utf8'));
  const results = await collectBilibiliLinks({
    ...review,
    detailCacheDir: paths.cacheDir,
    linkCacheDir: path.join(ROOT, '.cache', 'vcpedia-bilibili', singer.id),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  const missing = results.filter((row) => !row.bilibiliUrl);
  console.log(`Bilibili 链接：${results.length - missing.length}/${results.length}，待核验 ${missing.length}`);
  for (const row of missing) console.log(`- ${row.title}: ${row.status} (${row.pageUrl})`);
  if (missing.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.slice(1))) {
  await main();
}
