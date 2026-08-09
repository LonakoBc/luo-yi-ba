import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import {
  UNKNOWN,
  VCPEDIA_API_URL,
  dedupeCandidates,
  missingReviewFields,
  normalizeApiTitle,
  parseRenderedFallback,
  parseVcpediaSong,
  parseYearCandidates,
} from './vcpedia-lib.mjs';
import { loadSingerConfig, singerIdFromArgs, singerPaths, singerYears } from './singer-config.mjs';

const BATCH_SIZE = 10;
const refresh = process.argv.includes('--refresh');

function intervalMsFromArgs() {
  const inline = process.argv.find((argument) => argument.startsWith('--interval='));
  const seconds = inline ? Number(inline.slice('--interval='.length)) : 30;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('采集间隔必须是正数秒数');
  return Math.round(seconds * 1000);
}

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

function singerMembers(value) {
  return String(value ?? '').split('；').map((member) => member.trim()).filter(Boolean);
}

function databaseDraftFor(songs) {
  return songs.map((song) => ({
    title: song.title,
    staff: song.staff,
    releaseMonth: song.releaseMonth,
    singers: song.singers,
    voicebanks: song.voicebanks,
    concertCount: song.concertCount,
    special: song.special,
    lyrics: song.lyrics,
    bilibiliUrl: song.bilibiliUrl,
    vcpediaUrl: song.vcpediaUrl,
  }));
}

export function usesAllowedVoicebanks(song, allowedVoicebanks) {
  if (song.voicebanks === UNKNOWN) return true;
  const allowed = new Set(allowedVoicebanks);
  return song.voicebanks.split('；').every((voicebank) => allowed.has(voicebank));
}

function renderReport({ singer, candidates, songs, failures, duplicateCount, excluded }) {
  const issues = songs.filter((song) => song.issues.length);
  const lines = [
    `# VCPedia ${singer.name}传说曲采集报告`, '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 年度引用：${candidates + duplicateCount}`,
    `- 去重后候选：${candidates}`,
    `- 跨年份重复：${duplicateCount}`,
    `- 成功解析：${songs.length}`,
    `- 含待核验字段：${issues.length}`,
    `- 排除候选：${excluded.length}`,
    `- 页面失败：${failures.length}`, '',
    `允许声库：${singer.allowedVoicebanks.join('、')}。其他声库以及与其他声库混用的原版不纳入曲库。`, '',
    '说明：演唱会次数 0 表示 VCPedia 歌曲简介未明确记载演出活动，并非断言从未演出。', '',
    '## 待核验字段', '',
    ...(issues.length ? issues.map((song) => `- 《${song.title}》：${song.issues.join('、')}（${song.pageUrl}）`) : ['无']),
    '', '## 页面失败', '',
    ...(failures.length ? failures.map((row) => `- 《${row.title}》：${row.error}（${row.url}）`) : ['无']), '',
    '## 排除候选', '',
    ...(excluded.length ? excluded.map((row) => `- 《${row.title}》：${row.exclusionReason ?? row.voicebanks}（${row.pageUrl}）`) : ['无']), '',
  ];
  return lines.join('\n');
}

export async function main() {
  const singer = await loadSingerConfig(singerIdFromArgs());
  const paths = singerPaths(singer);
  const years = singerYears(singer);
  const resultPath = path.join(paths.outputDir, 'songs.normalized.json');
  const draftPath = path.join(paths.outputDir, 'database-draft.json');
  const reportPath = path.join(paths.outputDir, 'crawl-report.md');
  const minDelayMs = intervalMsFromArgs();
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({
      singer: singer.name,
      templatePages: years.map((year) => `${singer.templatePrefix}/${year}`),
      allowedVoicebanks: singer.allowedVoicebanks,
      cacheDir: paths.cacheDir,
      outputDir: paths.outputDir,
      published: singer.published,
      intervalSeconds: minDelayMs / 1000,
    }, null, 2));
    return;
  }
  await mkdir(paths.outputDir, { recursive: true });
  const fetcher = new PoliteFetcher({ cacheDir: paths.cacheDir, refresh, minDelayMs });
  const annualCandidates = [];

  console.log(`目标歌姬：${singer.name}（${years[0]}–${years.at(-1)}）`);
  for (const [index, year] of years.entries()) {
    console.log(`[年度 ${index + 1}/${years.length}] ${year}`);
    const page = `${singer.templatePrefix}/${year}`;
    const data = await fetcher.requestJson({
      url: apiUrl({ action: 'parse', page, prop: 'text', format: 'json', formatversion: '2', maxlag: '5' }),
      cacheKey: `year-${singer.id}-${year}`,
    });
    const templateUrl = `https://vcpedia.cn/${encodeURIComponent(page)}`;
    const parsed = parseYearCandidates(data.parse?.text ?? '', templateUrl, singer.name);
    if (!parsed.length) {
      console.warn(`${year} 年模板没有原创传说曲/神话曲，继续下一年度。`);
      continue;
    }
    annualCandidates.push(...parsed.map((candidate) => ({ ...candidate, sourceOrder: annualCandidates.length + candidate.sourceOrder })));
  }

  const candidates = dedupeCandidates(annualCandidates);
  if (!candidates.length) throw new Error(`${singer.name}全部年度模板均未解析出原创传说曲/神话曲，停止运行。`);
  const duplicateCount = annualCandidates.length - candidates.length;
  console.log(`年度引用 ${annualCandidates.length} 条，去重后 ${candidates.length} 首。`);

  const songs = [];
  const failures = [];
  const excluded = [];
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
        const song = parseVcpediaSong(pagePayload(page), candidate, { singer });
        if (usesAllowedVoicebanks(song, singer.allowedVoicebanks)) songs.push(song);
        else excluded.push({ ...song, exclusionReason: `使用范围外声库：${song.voicebanks}` });
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

  for (let index = songs.length - 1; index >= 0; index -= 1) {
    if (songs[index].singers === UNKNOWN || singerMembers(songs[index].singers).includes(singer.name)) continue;
    const [song] = songs.splice(index, 1);
    excluded.push({ ...song, exclusionReason: `原版演唱歌姬不包含${singer.name}：${song.singers}` });
  }

  songs.sort((a, b) => {
    const left = a.releaseMonth === UNKNOWN ? `${a.originalYear}-99` : a.releaseMonth;
    const right = b.releaseMonth === UNKNOWN ? `${b.originalYear}-99` : b.releaseMonth;
    return left.localeCompare(right, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN');
  });
  const result = {
    singer: { id: singer.id, name: singer.name, profileUrl: singer.profileUrl },
    source: 'https://vcpedia.cn/',
    license: 'CC BY-NC-SA 3.0 CN',
    generatedAt: new Date().toISOString(),
    annualReferenceCount: annualCandidates.length,
    duplicateCount,
    candidateCount: candidates.length,
    songs,
    excluded,
    failures,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(draftPath, `${JSON.stringify(databaseDraftFor(songs), null, 2)}\n`, 'utf8');
  await writeFile(reportPath, renderReport({ singer, candidates: candidates.length, songs, failures, duplicateCount, excluded }), 'utf8');
  console.log(`完成：${songs.length}/${candidates.length} 首，${songs.filter((song) => song.issues.length).length} 首待核验，${failures.length} 首失败。`);
  console.log(`规范化结果：${resultPath}`);
  console.log(`数据库草稿：${draftPath}`);
  if (failures.length) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.slice(1));
if (isMain) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
