import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATABASE_DIR = path.join(ROOT, 'database');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'producer-analysis');
const CACHE_DIR = path.join(ROOT, '.cache', 'vcpedia', 'producers');
const API_URL = 'https://vcpedia.cn/api.php';
const ROLE_PRIORITY = ['UP主', '作曲'];
const TIER_SCORE = { '未确认': 0, '殿堂曲': 1, '传说曲': 2, '神话曲': 3 };

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return decodeURIComponent(url.href).replace(/\/$/u, '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  } catch {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN');
  }
}

function splitPeople(value) {
  return String(value ?? '')
    .split(/[、，,；;／/]|\s+(?:&|＆|和|与)\s+/u)
    .map((name) => name.replace(/^\[\[|\]\]$/gu, '').trim())
    .filter((name) => name && name !== '待核验');
}

function parseStaff(staff) {
  const roles = new Map();
  for (const segment of String(staff ?? '').split(/[；;]/u)) {
    const match = segment.match(/^\s*([^：:]+)[：:]\s*(.+)$/u);
    if (!match) continue;
    roles.set(match[1].trim(), splitPeople(match[2]));
  }
  return roles;
}

function classifyProducer(name) {
  if (/官方|Official|Vsinger|忘川风华录|官方账号|官方賬號/iu.test(name)) return '官方账号';
  if (/社|组|團|团|工作室|Studio|Project|Music|音乐|樂團|组合|企划|企劃/iu.test(name)) return '团队/企划';
  return '个人/待核验';
}

function normalizeProducerName(value) {
  return String(value ?? '').normalize('NFKC')
    .replace(/[帳賬]號/gu, '账号').replace(/團隊/gu, '团队')
    .replace(/[\s_.-]+/gu, '').toLocaleLowerCase('zh-CN');
}

function isCreatorPage(page) {
  return (page?.categories ?? []).some((item) => /Category:创作者$/u.test(item.title));
}

function producerGroupKey(name, page) {
  if (isCreatorPage(page)) return `page:${normalizeProducerName(page.title)}`;
  return `name:${normalizeProducerName(name)}`;
}

async function walkFiles(dir, predicate, files = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(full, predicate, files);
    else if (predicate(full)) files.push(full);
  }
  return files;
}

function tierFromCategories(categories = []) {
  const text = categories.map((item) => typeof item === 'string' ? item : item.title).join(' ');
  if (/神话曲/u.test(text)) return '神话曲';
  if (/传说曲/u.test(text)) return '传说曲';
  if (/殿堂曲/u.test(text)) return '殿堂曲';
  return null;
}

async function buildTierMap() {
  const map = new Map();
  const normalizedFiles = await walkFiles(path.join(ROOT, 'outputs'), (file) => file.endsWith('songs.normalized.json'));
  for (const file of normalizedFiles) {
    let payload;
    try { payload = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
    const rows = Array.isArray(payload) ? payload : payload.songs ?? [];
    for (const row of rows) {
      const url = row.vcpediaUrl ?? row.pageUrl ?? row.url;
      const tier = row.tier;
      if (!url || !TIER_SCORE[tier]) continue;
      const key = normalizeUrl(url);
      if ((TIER_SCORE[tier] ?? 0) > (TIER_SCORE[map.get(key)] ?? 0)) map.set(key, tier);
    }
  }

  const cacheFiles = await walkFiles(path.join(ROOT, '.cache', 'vcpedia'), (file) => /details-.*\.json$/u.test(file));
  for (const file of cacheFiles) {
    let payload;
    try { payload = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
    for (const page of payload.query?.pages ?? []) {
      const tier = tierFromCategories(page.categories);
      if (!tier || !page.title) continue;
      const key = normalizeUrl(`https://vcpedia.cn/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`);
      if ((TIER_SCORE[tier] ?? 0) > (TIER_SCORE[map.get(key)] ?? 0)) map.set(key, tier);
    }
  }
  return map;
}

async function loadSongs(tierMap) {
  const catalog = JSON.parse(await readFile(path.join(DATABASE_DIR, 'catalog.json'), 'utf8'));
  const byUrl = new Map();
  for (const item of catalog) {
    const songs = JSON.parse(await readFile(path.join(DATABASE_DIR, item.file), 'utf8'));
    for (const song of songs) {
      const key = normalizeUrl(song.vcpediaUrl || song.title);
      if (!byUrl.has(key)) byUrl.set(key, { ...song, globalKey: key, libraries: [item.id] });
      else byUrl.get(key).libraries.push(item.id);
    }
  }
  return [...byUrl.values()].map((song) => ({ ...song, tier: tierMap.get(song.globalKey) ?? '未确认' }));
}

function titleForProducer(name) {
  return name.replace(/^普通的/u, '').trim();
}

function makeApiUrl(titles) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'revisions|categories', rvprop: 'content', rvslots: 'main', cllimit: 'max',
    titles: titles.join('|'), maxlag: '5',
  });
  return `${API_URL}?${params}`;
}

function cacheKey(titles) {
  return `batch-${createHash('sha256').update(titles.join('|')).digest('hex').slice(0, 16)}`;
}

async function fetchProducerPages(names) {
  const fetcher = new PoliteFetcher({ cacheDir: CACHE_DIR, minDelayMs: 2_000 });
  const results = new Map();
  for (let index = 0; index < names.length; index += 10) {
    const batch = names.slice(index, index + 10);
    const payload = await fetcher.requestJson({ url: makeApiUrl(batch), cacheKey: cacheKey(batch) });
    const redirects = new Map((payload.query?.redirects ?? []).map((item) => [item.from, item.to]));
    const pages = new Map((payload.query?.pages ?? []).map((page) => [page.title, page]));
    for (const requested of batch) {
      const resolved = redirects.get(requested) ?? requested;
      results.set(requested, pages.get(resolved) ?? { title: resolved, missing: true });
    }
    console.log(`P主资料页：${Math.min(index + batch.length, names.length)}/${names.length}`);
  }
  return results;
}

function extractFirstPost(wikitext, fallbackMonth) {
  const text = String(wikitext ?? '').replace(/'''?/gu, '').replace(/\{\{[^{}]*\}\}/gu, ' ');
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const fullDate = /(20\d{2})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/u;
  const explicit = lines.find((line) => /初投稿|处女作|處女作|首次投稿|第一(?:首|个|個).{0,12}(?:原创|原創|作品|歌曲)/u.test(line) && fullDate.test(line));
  const match = explicit?.match(fullDate);
  if (match) return {
    value: `${match[1]}-${String(match[2]).padStart(2, '0')}${match[3] ? `-${String(match[3]).padStart(2, '0')}` : ''}`,
    basis: /初投稿|首次投稿/u.test(explicit) ? '资料页明确记载' : '资料页首作记录',
  };
  const activity = text.match(/\|\s*活跃年份\s*=\s*(20\d{2})/u);
  if (activity) return { value: activity[1], basis: '资料页活跃年份起点' };
  const dates = [...text.matchAll(/(20\d{2})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/gu)]
    .map((item) => ({ raw: item[0], sort: Number(item[1]) * 10000 + Number(item[2]) * 100 + Number(item[3] ?? 1) }))
    .filter((item) => item.sort >= 20000101 && item.sort <= 20261231)
    .sort((a, b) => a.sort - b.sort);
  if (dates.length) {
    const date = dates[0].raw.match(fullDate);
    return {
      value: `${date[1]}-${String(date[2]).padStart(2, '0')}${date[3] ? `-${String(date[3]).padStart(2, '0')}` : ''}`,
      basis: '资料页最早日期记录',
    };
  }
  return { value: fallbackMonth, basis: '当前曲库最早收录作品' };
}

function representativeSongs(entries) {
  return [...entries].sort((left, right) =>
    (TIER_SCORE[right.song.tier] - TIER_SCORE[left.song.tier])
    || (right.song.concertCount - left.song.concertCount)
    || left.song.releaseMonth.localeCompare(right.song.releaseMonth)
    || left.song.title.localeCompare(right.song.title, 'zh-CN'))
    .slice(0, 3).map(({ song }) => song.title);
}

function topSingers(entries) {
  const counts = new Map();
  for (const { song } of entries) for (const singer of String(song.singers).split(/[；;]/u).filter(Boolean)) {
    counts.set(singer, (counts.get(singer) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 5).map(([name, count]) => `${name}（${count}）`).join('；');
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const tierMap = await buildTierMap();
  const songs = await loadSongs(tierMap);
  const producers = new Map();
  const songDetails = [];

  for (const song of songs) {
    const roles = parseStaff(song.staff);
    const chosen = [];
    for (const role of ROLE_PRIORITY) for (const rawName of roles.get(role) ?? []) {
      const name = titleForProducer(rawName);
      const existing = chosen.find((item) => item.name === name);
      if (existing) existing.roles.add(role);
      else chosen.push({ name, roles: new Set([role]) });
    }
    for (const item of chosen) {
      if (!producers.has(item.name)) producers.set(item.name, []);
      const entry = { song, roles: [...item.roles] };
      producers.get(item.name).push(entry);
      songDetails.push({ producer: item.name, ...entry });
    }
  }

  const names = [...producers.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const pages = await fetchProducerPages(names);
  const groups = new Map();
  for (const name of names) {
    const page = pages.get(name);
    const key = producerGroupKey(name, page);
    if (!groups.has(key)) groups.set(key, { aliases: [], entries: [], pages: [] });
    const group = groups.get(key);
    group.aliases.push(name);
    group.entries.push(...producers.get(name));
    if (page && !page.missing) group.pages.push(page);
  }

  const rows = [...groups.values()].map((group) => {
    const aliases = [...new Set(group.aliases)];
    const entriesBySong = new Map();
    for (const entry of group.entries) {
      const existing = entriesBySong.get(entry.song.globalKey);
      if (!existing) entriesBySong.set(entry.song.globalKey, { ...entry, roles: [...entry.roles] });
      else existing.roles = [...new Set([...existing.roles, ...entry.roles])];
    }
    const entries = [...entriesBySong.values()];
    const creatorPage = group.pages.find(isCreatorPage);
    const page = creatorPage ?? group.pages[0];
    const name = creatorPage?.title ?? aliases.sort((a, b) => b.length - a.length || a.localeCompare(b, 'zh-CN'))[0];
    const earliest = [...entries].sort((a, b) => a.song.releaseMonth.localeCompare(b.song.releaseMonth))[0].song.releaseMonth;
    const wikitext = page?.revisions?.[0]?.slots?.main?.content ?? '';
    const firstPost = extractFirstPost(wikitext, earliest);
    const tiers = entries.reduce((acc, { song }) => { acc[song.tier] = (acc[song.tier] ?? 0) + 1; return acc; }, {});
    const representatives = representativeSongs(entries);
    const roles = new Set(entries.flatMap((entry) => entry.roles));
    const resolvedTitle = page?.title ?? name;
    const pageExists = !page?.missing && Boolean(page?.pageid);
    const vcpediaUrl = pageExists ? `https://vcpedia.cn/${encodeURIComponent(resolvedTitle.replaceAll(' ', '_'))}` : `https://vcpedia.cn/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
    const issues = [];
    if (!pageExists) issues.push('VCPedia 无独立资料页');
    if (firstPost.basis !== '资料页明确记载' && firstPost.basis !== '资料页首作记录') issues.push(`首次投稿时间采用“${firstPost.basis}”`);
    if ((tiers['未确认'] ?? 0) > 0) issues.push(`${tiers['未确认']} 首作品等级未确认`);
    return {
      name, aliases: aliases.filter((alias) => alias !== name).join('；'), resolvedTitle, type: classifyProducer(name), roles: [...roles].sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)).join('；'),
      songCount: entries.length, firstPost: firstPost.value, firstPostBasis: firstPost.basis,
      representatives, hallOnly: tiers['殿堂曲'] ?? 0, legend: tiers['传说曲'] ?? 0, myth: tiers['神话曲'] ?? 0,
      hallTotal: (tiers['殿堂曲'] ?? 0) + (tiers['传说曲'] ?? 0) + (tiers['神话曲'] ?? 0),
      unknownTier: tiers['未确认'] ?? 0, mainSingers: topSingers(entries), vcpediaUrl,
      status: issues.length ? '待核验' : '已核验', notes: issues.join('；'),
    };
  }).sort((a, b) => b.hallTotal - a.hallTotal || b.songCount - a.songCount || a.name.localeCompare(b.name, 'zh-CN'));

  const canonicalByAlias = new Map();
  for (const row of rows) for (const alias of [row.name, ...row.aliases.split('；').filter(Boolean)]) canonicalByAlias.set(alias, row.name);

  const detailRows = songDetails.map(({ producer, song, roles }) => ({
    producer: canonicalByAlias.get(producer) ?? producer, sourceName: producer, roles: roles.join('；'), title: song.title, releaseMonth: song.releaseMonth,
    singers: song.singers, tier: song.tier, concertCount: song.concertCount,
    vcpediaUrl: song.vcpediaUrl, bilibiliUrl: song.bilibiliUrl,
  })).sort((a, b) => a.producer.localeCompare(b.producer, 'zh-CN') || a.releaseMonth.localeCompare(b.releaseMonth));

  const summary = {
    generatedAt: new Date().toISOString(), songCount: songs.length, producerCount: rows.length,
    tierDistribution: songs.reduce((acc, song) => { acc[song.tier] = (acc[song.tier] ?? 0) + 1; return acc; }, {}),
    pageCount: rows.filter((row) => row.status === '已核验' || !row.notes.includes('无独立资料页')).length,
    rows, details: detailRows,
  };
  await writeFile(path.join(OUTPUT_DIR, 'producer-analysis.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ songs: songs.length, producers: rows.length, withPage: summary.pageCount, exactFirstPost: rows.filter((row) => /明确记载|首作记录/u.test(row.firstPostBasis)).length, tiers: rows.reduce((sum, row) => sum + row.hallTotal, 0) }, null, 2));
}

await main();
