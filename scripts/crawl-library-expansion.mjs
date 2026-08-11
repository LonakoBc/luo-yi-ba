import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import { UNKNOWN, VCPEDIA_API_URL, normalizeApiTitle, parseVcpediaSong } from './vcpedia-lib.mjs';
import { ROOT, loadSingerCatalog } from './singer-config.mjs';

const BATCH_SIZE = 10;
const MANIFEST_PATH = path.join(ROOT, 'scripts', 'library-expansion-2026.json');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'vcpedia-crawl', 'library-expansion-2026');
const CACHE_DIR = path.join(ROOT, '.cache', 'vcpedia', 'library-expansion-2026');
const refresh = process.argv.includes('--refresh');

function intervalMsFromArgs() {
  const inline = process.argv.find((argument) => argument.startsWith('--interval='));
  const seconds = inline ? Number(inline.slice('--interval='.length)) : 1;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('采集间隔必须是正数秒数');
  return Math.round(seconds * 1000);
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function cacheKey(titles) {
  return createHash('sha256').update(titles.join('\n')).digest('hex').slice(0, 16);
}

function pagePayload(page) {
  return {
    wikitext: page?.revisions?.[0]?.slots?.main?.content ?? '',
    categories: (page?.categories ?? []).map(({ title }) => title.replace(/^Category:/u, '')),
  };
}

function pageUrl(title) {
  return `https://vcpedia.cn/${encodeURIComponent(String(title).replaceAll(' ', '_'))}`;
}

function splitMembers(value) {
  return String(value ?? '').split('；').map((item) => item.trim()).filter(Boolean);
}

function candidateFor(item, title, year = 2026) {
  const url = pageUrl(title);
  return {
    title: item.title,
    pageTitle: title,
    url,
    sourceUrl: url,
    templateUrl: url,
    year,
    originalYear: year,
    tier: '扩充曲目',
    sourceOrder: item.sourceOrder,
    sectionAnchor: item.sectionAnchor,
  };
}

function parsePage(item, page, singer) {
  const payload = pagePayload(page);
  const initial = parseVcpediaSong(payload, candidateFor(item, page.title), { singer });
  const year = /^20\d{2}-/u.test(initial.releaseMonth) ? Number(initial.releaseMonth.slice(0, 4)) : 2026;
  const parsed = parseVcpediaSong(payload, candidateFor(item, page.title, year), { singer });
  return {
    ...parsed,
    concertCount: item.concertCount,
    special: item.special,
    bilibiliUrl: parsed.bilibiliUrl === UNKNOWN ? '' : parsed.bilibiliUrl,
    requestedTitle: item.title,
    primarySinger: item.primarySinger,
    note: item.note ?? '',
    preexisting: Boolean(item.preexisting),
    resolvedPageTitle: page.title,
  };
}

function mapsFor(data) {
  const aliases = new Map();
  for (const row of data.query?.normalized ?? []) aliases.set(normalizeApiTitle(row.from), normalizeApiTitle(row.to));
  for (const row of data.query?.redirects ?? []) aliases.set(normalizeApiTitle(row.from), normalizeApiTitle(row.to));
  const pages = new Map((data.query?.pages ?? []).map((page) => [normalizeApiTitle(page.title), page]));
  return { aliases, pages };
}

function pageForTitle(title, { aliases, pages }) {
  let key = normalizeApiTitle(title);
  const visited = new Set();
  while (aliases.has(key) && !visited.has(key)) {
    visited.add(key);
    key = aliases.get(key);
  }
  return pages.get(key);
}

function primarySingerMatches(song, singer) {
  if (!singer) return true;
  const accepted = new Set([singer.name, ...(singer.aliases ?? [])]);
  return splitMembers(song.singers).some((name) => accepted.has(name));
}

function reviewIssues(song, singer) {
  const issues = [];
  if (!song.staff || song.staff === UNKNOWN) issues.push('STAFF');
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth)) issues.push('发布时间');
  if (!song.singers || song.singers === UNKNOWN) issues.push('演唱歌姬');
  if (!song.voicebanks || song.voicebanks === UNKNOWN) issues.push('使用声库');
  if (!song.lyrics || song.lyrics === UNKNOWN) issues.push('歌词');
  if (!primarySingerMatches(song, singer)) issues.push(`未识别到主歌姬${singer.name}`);
  return issues;
}

export async function crawlLibraryExpansion() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
    .map((item, sourceOrder) => ({ ...item, sourceOrder }));
  const catalog = await loadSingerCatalog();
  const singersByName = new Map(catalog.singers.flatMap((singer) => [singer.name, ...(singer.aliases ?? [])].map((name) => [name, singer])));
  const fetcher = new PoliteFetcher({ cacheDir: CACHE_DIR, refresh, minDelayMs: intervalMsFromArgs() });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const songs = [];
  const failures = [];
  const batches = chunks(manifest, BATCH_SIZE);
  for (const [index, batch] of batches.entries()) {
    const titles = batch.map((item) => item.pageTitle ?? item.title);
    console.log(`[${index + 1}/${batches.length}] ${titles.join('、')}`);
    const body = new URLSearchParams({
      action: 'query', prop: 'revisions|categories', rvprop: 'content', rvslots: 'main',
      cllimit: 'max', redirects: '1', converttitles: '1', titles: titles.join('|'),
      format: 'json', formatversion: '2', maxlag: '5',
    }).toString();
    try {
      const data = await fetcher.requestJson({
        url: VCPEDIA_API_URL,
        method: 'POST',
        body,
        cacheKey: `details-${cacheKey(titles)}`,
      });
      const maps = mapsFor(data);
      for (const item of batch) {
        const requested = item.pageTitle ?? item.title;
        const page = pageForTitle(requested, maps);
        if (!page || page.missing) {
          failures.push({ ...item, reason: '页面不存在或 API 未返回页面' });
          continue;
        }
        const singer = singersByName.get(item.primarySinger);
        const song = parsePage(item, page, singer);
        const issues = reviewIssues(song, singer);
        songs.push({ ...song, issues });
      }
    } catch (error) {
      for (const item of batch) failures.push({ ...item, reason: error.message });
    }
  }

  songs.sort((a, b) => a.sourceOrder - b.sourceOrder);
  await writeFile(path.join(OUTPUT_DIR, 'songs.crawled.json'), `${JSON.stringify(songs, null, 2)}\n`, 'utf8');
  await writeFile(path.join(OUTPUT_DIR, 'failures.json'), `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
  const report = [
    '# 2026 曲库扩充采集报告', '',
    `- 清单：${manifest.length} 首`,
    `- 成功读取：${songs.length} 首`,
    `- 页面失败：${failures.length} 首`,
    `- 含待核验字段：${songs.filter((song) => song.issues.length).length} 首`, '',
    '## 页面失败', '',
    ...(failures.length ? failures.map((item) => `- 《${item.title}》：${item.reason}`) : ['无']), '',
    '## 待核验', '',
    ...songs.filter((song) => song.issues.length).map((song) => `- 《${song.title}》：${song.issues.join('、')}（${song.vcpediaUrl}）`), '',
  ].join('\n');
  await writeFile(path.join(OUTPUT_DIR, 'crawl-report.md'), report, 'utf8');
  return { manifest: manifest.length, songs: songs.length, failures: failures.length, issues: songs.filter((song) => song.issues.length).length };
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  console.log(await crawlLibraryExpansion());
}
