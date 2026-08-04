import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import {
  UNKNOWN,
  VCPEDIA_API_URL,
  YEARS,
  dedupeCandidates,
  missingReviewFields,
  normalizeApiTitle,
  parseRenderedFallback,
  parseVcpediaSong,
  parseYearCandidates,
} from './vcpedia-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'vcpedia');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'vcpedia-crawl');
const RESULT_PATH = path.join(OUTPUT_DIR, 'songs.normalized.json');
const REPORT_PATH = path.join(OUTPUT_DIR, 'crawl-report.md');
const BATCH_SIZE = 10;
const refresh = process.argv.includes('--refresh');

function apiUrl(params) {
  const url = new URL(VCPEDIA_API_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

function batchKey(titles) {
  return createHash('sha256').update(titles.join('\n')).digest('hex').slice(0, 16);
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function queryPageMap(data) {
  const redirects = new Map((data.query?.redirects ?? []).map((row) => [normalizeApiTitle(row.from), normalizeApiTitle(row.to)]));
  const pages = new Map();
  for (const page of data.query?.pages ?? []) pages.set(normalizeApiTitle(page.title), page);
  return { redirects, pages };
}

function pageForCandidate(candidate, maps) {
  let key = normalizeApiTitle(candidate.pageTitle);
  key = maps.redirects.get(key) ?? key;
  return maps.pages.get(key);
}

function pagePayload(page) {
  return {
    wikitext: page?.revisions?.[0]?.slots?.main?.content ?? '',
    categories: (page?.categories ?? []).map(({ title }) => title.replace(/^Category:/u, '')),
  };
}

function needsFallback(song) {
  return song.staff === UNKNOWN || song.singers === UNKNOWN;
}

function mergeFallback(song, fallback) {
  const merged = { ...song };
  if (merged.staff === UNKNOWN && fallback.staff !== UNKNOWN) merged.staff = fallback.staff;
  if (merged.singers === UNKNOWN && fallback.singers !== UNKNOWN) merged.singers = fallback.singers;
  merged.issues = missingReviewFields(merged);
  return merged;
}

function renderReport({ candidates, songs, failures, duplicateCount }) {
  const issues = songs.filter((song) => song.issues.length);
  const lines = [
    '# VCPedia 洛天依传说曲采集报告', '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 年度引用：${candidates + duplicateCount}`,
    `- 去重后候选：${candidates}`,
    `- 跨年份重复：${duplicateCount}`,
    `- 成功解析：${songs.length}`,
    `- 含待核验字段：${issues.length}`,
    `- 页面失败：${failures.length}`, '',
    '说明：演唱会次数 0 表示 VCPedia 歌曲简介未明确记载演出活动，并非断言从未演出。', '',
    '## 待核验字段', '',
    ...(issues.length ? issues.map((song) => `- 《${song.title}》：${song.issues.join('、')}（${song.pageUrl}）`) : ['无']),
    '', '## 页面失败', '',
    ...(failures.length ? failures.map((row) => `- 《${row.title}》：${row.error}（${row.url}）`) : ['无']), '',
  ];
  return lines.join('\n');
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const fetcher = new PoliteFetcher({ cacheDir: CACHE_DIR, refresh });
  const annualCandidates = [];

  for (const [index, year] of YEARS.entries()) {
    console.log(`[年度 ${index + 1}/${YEARS.length}] ${year}`);
    const page = `Template:洛天依/${year}`;
    const data = await fetcher.requestJson({
      url: apiUrl({ action: 'parse', page, prop: 'text', format: 'json', formatversion: '2', maxlag: '5' }),
      cacheKey: `year-${year}`,
    });
    const templateUrl = `https://vcpedia.cn/Template:${encodeURIComponent(`洛天依/${year}`)}`;
    const parsed = parseYearCandidates(data.parse?.text ?? '', templateUrl);
    if (!parsed.length) throw new Error(`${year} 年模板未解析出原创传说曲/神话曲，停止运行。`);
    annualCandidates.push(...parsed.map((candidate) => ({ ...candidate, sourceOrder: annualCandidates.length + candidate.sourceOrder })));
  }

  const candidates = dedupeCandidates(annualCandidates);
  const duplicateCount = annualCandidates.length - candidates.length;
  console.log(`年度引用 ${annualCandidates.length} 条，去重后 ${candidates.length} 首。`);

  const songs = [];
  const failures = [];
  for (const [batchIndex, batch] of chunks(candidates, BATCH_SIZE).entries()) {
    console.log(`[详情批次 ${batchIndex + 1}/${Math.ceil(candidates.length / BATCH_SIZE)}] ${batch.map(({ title }) => title).join('、')}`);
    const titles = batch.map(({ pageTitle }) => pageTitle);
    const body = new URLSearchParams({
      action: 'query', prop: 'revisions|categories', rvprop: 'content', rvslots: 'main',
      cllimit: 'max', redirects: '1', titles: titles.join('|'), format: 'json', formatversion: '2', maxlag: '5',
    }).toString();
    try {
      const data = await fetcher.requestJson({ url: VCPEDIA_API_URL, method: 'POST', body, cacheKey: `details-${batchKey(titles)}` });
      const maps = queryPageMap(data);
      for (const candidate of batch) {
        const page = pageForCandidate(candidate, maps);
        if (!page || page.missing) {
          failures.push({ title: candidate.title, url: candidate.url, error: '详情页不存在或 API 未返回页面' });
          continue;
        }
        songs.push(parseVcpediaSong(pagePayload(page), candidate));
      }
    } catch (error) {
      for (const candidate of batch) failures.push({ title: candidate.title, url: candidate.url, error: error.message });
    }
  }

  for (let index = 0; index < songs.length; index += 1) {
    if (!needsFallback(songs[index])) continue;
    console.log(`[补充解析] ${songs[index].title}`);
    try {
      const data = await fetcher.requestJson({
        url: apiUrl({ action: 'parse', page: decodeURIComponent(new URL(songs[index].pageUrl).pathname.slice(1)), prop: 'text', format: 'json', formatversion: '2', maxlag: '5' }),
        cacheKey: `fallback-${batchKey([songs[index].pageUrl])}`,
      });
      songs[index] = mergeFallback(songs[index], parseRenderedFallback(data.parse?.text ?? ''));
    } catch (error) {
      songs[index].issues.push(`补充解析失败：${error.message}`);
    }
  }

  songs.sort((a, b) => {
    const left = a.releaseMonth === UNKNOWN ? `${a.originalYear}-99` : a.releaseMonth;
    const right = b.releaseMonth === UNKNOWN ? `${b.originalYear}-99` : b.releaseMonth;
    return left.localeCompare(right, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN');
  });
  const result = {
    source: 'https://vcpedia.cn/',
    license: 'CC BY-NC-SA 3.0 CN',
    generatedAt: new Date().toISOString(),
    annualReferenceCount: annualCandidates.length,
    duplicateCount,
    candidateCount: candidates.length,
    songs,
    failures,
  };
  await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_PATH, renderReport({ candidates: candidates.length, songs, failures, duplicateCount }), 'utf8');
  console.log(`完成：${songs.length}/${candidates.length} 首，${songs.filter((song) => song.issues.length).length} 首待核验，${failures.length} 首失败。`);
  console.log(`规范化结果：${RESULT_PATH}`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
