import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import { VCPEDIA_API_URL } from './vcpedia-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKC').replaceAll('_', ' ').trim().toLocaleLowerCase('zh-CN');
}

function normalizeVideoId(value) {
  const match = String(value ?? '').match(/(?:https?:\/\/(?:www\.)?bilibili\.com\/video\/)?(?:av)?(BV[0-9A-Za-z]{10}|av\d+|\d+)/iu);
  if (!match) return null;
  const id = match[1];
  if (/^BV/iu.test(id)) return id;
  return /^av/iu.test(id) ? id.toLowerCase() : `av${id}`;
}

function toVideoUrl(id) {
  return id ? `https://www.bilibili.com/video/${id}/` : null;
}

function originalSection(wikitext) {
  const top = String(wikitext ?? '').split(/^==\s*(?:二次创作|翻唱|翻调|翻填|其他版本|相关版本)\s*==\s*$/mu)[0];
  const tabsMatch = top.match(/\|\s*label1\s*=\s*原版[\s\S]*?\|\s*text1\s*=([\s\S]*?)(?=\n\|\s*(?:label|text)2\s*=|\n\}\})/u);
  return tabsMatch?.[1] || top;
}

export function extractBilibiliUrl(wikitext) {
  const source = originalSection(wikitext);
  const songboxStart = source.search(/\{\{\s*(?:VOCALOID|ACE|SynthV)?[_ ]?Songbox\b/iu);
  const songboxEnd = songboxStart >= 0 ? source.indexOf('\n}}', songboxStart) : -1;
  const songbox = songboxStart >= 0
    ? source.slice(songboxStart, songboxEnd >= 0 ? songboxEnd + 3 : songboxStart + 6000)
    : source.slice(0, 6000);
  const preferredPatterns = [
    /^\|\s*(?:bb_id|bilibili_id|b站id)\s*=\s*([^\n|}]+)/imu,
    /^\|\s*(?:链接|連結|link)\s*=([^\n}]*)/imu,
  ];
  for (const pattern of preferredPatterns) {
    const value = songbox.match(pattern)?.[1];
    const id = normalizeVideoId(value);
    if (id) return toVideoUrl(id);
  }

  const directUrl = source.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]{10}|av\d+|\d+)/iu);
  if (directUrl) return toVideoUrl(normalizeVideoId(directUrl[1]));

  const videoTemplate = source.match(/\{\{\s*BilibiliVideo\b[\s\S]{0,300}?\|\s*id\s*=\s*(BV[0-9A-Za-z]{10}|av\d+|\d+)/iu);
  if (videoTemplate) return toVideoUrl(normalizeVideoId(videoTemplate[1]));

  // 少数原作首发于 YouTube / niconico，VCPedia 仅列出 B 站搬运。
  const avTemplate = source.match(/\{\{\s*av\s*\|\s*(BV[0-9A-Za-z]{10}|av\d+|\d+)/iu);
  if (avTemplate) return toVideoUrl(normalizeVideoId(avTemplate[1]));
  return null;
}

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

export async function collectBilibiliLinks({ songs, sources, requestDelayMs = 1000 }) {
  const sourceByTitle = new Map(sources.map((row) => [normalizeTitle(row['曲名']), row]));
  const cachedPages = await readExistingDetailCache(path.join(ROOT, '.cache', 'vcpedia'));
  const fetcher = new PoliteFetcher({
    cacheDir: path.join(ROOT, '.cache', 'vcpedia-bilibili'),
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
  const reviewDataPath = path.resolve(process.argv[2] ?? path.join(ROOT, '.codex-spreadsheet', 'review-data.json'));
  const outputPath = path.resolve(process.argv[3] ?? path.join(ROOT, 'outputs', 'vcpedia-crawl', 'bilibili-links.json'));
  const review = JSON.parse(await readFile(reviewDataPath, 'utf8'));
  const results = await collectBilibiliLinks(review);
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
