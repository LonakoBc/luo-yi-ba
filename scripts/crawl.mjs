import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  TEMPLATE_URL,
  allocateSlug,
  missingFields,
  parseCandidates,
  parseSongPage,
  renderSongMarkdown,
  slugifyCandidate,
  slugifyTitle,
} from './lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONG_DIR = path.join(ROOT, 'song');
const CACHE_DIR = path.join(ROOT, '.cache', 'moegirl');
const REPORT_PATH = path.join(ROOT, 'crawl-report.md');
const MIN_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;
const refresh = process.argv.includes('--refresh');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class PoliteFetcher {
  #lastCompletedAt = 0;

  async fetch(url, cacheKey) {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.html`);
    if (!refresh) {
      try {
        return await readFile(cachePath, 'utf8');
      } catch {
        // Cache miss.
      }
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const remainingDelay = MIN_DELAY_MS - (Date.now() - this.#lastCompletedAt);
      if (remainingDelay > 0) await sleep(remainingDelay);
      try {
        const response = await fetch(url, {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; luo-yi-ba-data-builder/1.0; local research project)',
            accept: 'text/html,application/xhtml+xml',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const html = await response.text();
        this.#lastCompletedAt = Date.now();
        await writeFile(cachePath, html, 'utf8');
        return html;
      } catch (error) {
        this.#lastCompletedAt = Date.now();
        lastError = error;
        console.warn(`  请求失败（${attempt}/${MAX_ATTEMPTS}）：${error.message}`);
      }
    }
    throw lastError;
  }
}

function cacheKeyFor(candidate, index) {
  return `${String(index + 1).padStart(4, '0')}-${slugifyTitle(candidate.title)}`;
}

async function existingGeneratedSongs() {
  const existing = new Map();
  try {
    for (const file of await readdir(SONG_DIR)) {
      if (!file.endsWith('.md')) continue;
      const content = await readFile(path.join(SONG_DIR, file), 'utf8');
      const title = content.match(/^曲名：《(.+)》/m)?.[1];
      if (title) existing.set(file, title);
    }
  } catch {
    // First run has no song directory.
  }
  return existing;
}

function renderReport({ candidates, completed, issues, failures, collisions, stale }) {
  const lines = [
    '# 萌娘百科洛天依曲目爬取报告',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 候选曲目：${candidates}`,
    `- 成功生成：${completed}`,
    `- 含待核验字段：${issues.length}`,
    `- 页面失败：${failures.length}`,
    `- 拼音冲突：${collisions.length}`,
    `- 疑似过期旧文件：${stale.length}`,
    '',
  ];

  const section = (title, rows, formatter) => {
    lines.push(`## ${title}`, '');
    if (rows.length === 0) lines.push('无', '');
    else {
      for (const row of rows) lines.push(`- ${formatter(row)}`);
      lines.push('');
    }
  };

  section('待核验字段', issues, (row) => `《${row.title}》：${row.fields.join('、')}（${row.url}）`);
  section('页面失败', failures, (row) => `《${row.title}》：${row.error}（${row.url}）`);
  section('拼音文件名冲突', collisions, (row) => `《${row.title}》：${row.base}.md → ${row.actual}.md`);
  section('疑似过期旧文件', stale, (row) => `${row.file}（《${row.title}》）`);
  return lines.join('\n');
}

async function main() {
  await mkdir(SONG_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  const oldSongs = await existingGeneratedSongs();
  const fetcher = new PoliteFetcher();

  console.log('读取洛天依曲目模板…');
  const templateHtml = await fetcher.fetch(TEMPLATE_URL, 'template-luo-tian-yi');
  const candidates = parseCandidates(templateHtml);
  if (candidates.length === 0) throw new Error('模板解析结果为空，停止写入以避免产生错误数据。');
  console.log(`发现 ${candidates.length} 首原创传说曲/神话曲。`);

  const usedSlugs = new Set();
  const currentFiles = new Set();
  const issues = [];
  const failures = [];
  const collisions = [];
  let completed = 0;

  for (const [index, candidate] of candidates.entries()) {
    console.log(`[${index + 1}/${candidates.length}] ${candidate.title}`);
    const base = slugifyCandidate(candidate);
    const slug = allocateSlug(base, usedSlugs);
    if (slug !== base) collisions.push({ title: candidate.title, base, actual: slug });
    const file = `${slug}.md`;
    currentFiles.add(file);

    try {
      const html = await fetcher.fetch(candidate.url, cacheKeyFor(candidate, index));
      const song = parseSongPage(html, candidate);
      const fields = missingFields(song);
      if (fields.length) issues.push({ title: candidate.title, fields, url: candidate.url });
      const targetPath = path.join(SONG_DIR, file);
      const tempPath = `${targetPath}.tmp`;
      await writeFile(tempPath, renderSongMarkdown(song), 'utf8');
      await rename(tempPath, targetPath);
      completed += 1;
    } catch (error) {
      failures.push({ title: candidate.title, url: candidate.url, error: error.message });
    }
  }

  const stale = [...oldSongs.entries()]
    .filter(([file]) => !currentFiles.has(file))
    .map(([file, title]) => ({ file, title }));
  const report = renderReport({
    candidates: candidates.length,
    completed,
    issues,
    failures,
    collisions,
    stale,
  });
  await writeFile(REPORT_PATH, report, 'utf8');
  console.log(`完成：生成 ${completed}/${candidates.length} 首，${issues.length} 首待核验，${failures.length} 首失败。`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
