import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import { VCPEDIA_API_URL, normalizeApiTitle, parseVcpediaSong } from './vcpedia-lib.mjs';
import { loadSingerConfig, singerPaths } from './singer-config.mjs';

const singer = await loadSingerConfig('zhiyu-moke');
const paths = singerPaths(singer);
const candidates = [
  {
    title: '戴帽子的孩子',
    pageTitle: '戴帽子的孩子',
    url: 'https://vcpedia.cn/%E6%88%B4%E5%B8%BD%E5%AD%90%E7%9A%84%E5%AD%A9%E5%AD%90',
    templateUrl: 'https://vcpedia.cn/Template:%E5%BE%B5%E7%BE%BD%E6%91%A9%E6%9F%AF/2019',
    sourceUrl: 'https://vcpedia.cn/%E6%88%B4%E5%B8%BD%E5%AD%90%E7%9A%84%E5%AD%A9%E5%AD%90',
    year: 2019,
    tier: '传说曲',
    sourceOrder: 100,
  },
  {
    title: '你好，世界！',
    pageTitle: '你好，世界！',
    url: 'https://vcpedia.cn/%E4%BD%A0%E5%A5%BD%EF%BC%8C%E4%B8%96%E7%95%8C%EF%BC%81',
    templateUrl: 'https://vcpedia.cn/Template:%E5%BE%B4%E7%BE%BD%E6%91%A9%E6%9F%AF/2019',
    sourceUrl: 'https://vcpedia.cn/%E4%BD%A0%E5%A5%BD%EF%BC%8C%E4%B8%96%E7%95%8C%EF%BC%81',
    year: 2019,
    tier: '传说曲',
    sourceOrder: 101,
  },
];

const body = new URLSearchParams({
  action: 'query', prop: 'revisions|categories', rvprop: 'content', rvslots: 'main',
  cllimit: 'max', redirects: '1', titles: candidates.map(({ pageTitle }) => pageTitle).join('|'),
  format: 'json', formatversion: '2', maxlag: '5',
}).toString();
const fetcher = new PoliteFetcher({ cacheDir: paths.cacheDir, minDelayMs: 2000 });
const data = await fetcher.requestJson({ url: VCPEDIA_API_URL, method: 'POST', body, cacheKey: 'manual-details-dai-mao-hello-world' });
const redirects = new Map((data.query?.redirects ?? []).map((row) => [normalizeApiTitle(row.from), normalizeApiTitle(row.to)]));
const pages = new Map((data.query?.pages ?? []).map((page) => [normalizeApiTitle(page.title), page]));
const payload = (page) => ({
  wikitext: page?.revisions?.[0]?.slots?.main?.content ?? '',
  categories: (page?.categories ?? []).map(({ title }) => title.replace(/^Category:/u, '')),
});
const added = [];
for (const candidate of candidates) {
  const key = redirects.get(normalizeApiTitle(candidate.pageTitle)) ?? normalizeApiTitle(candidate.pageTitle);
  const page = pages.get(key);
  if (!page || page.missing) throw new Error(`详情页不存在：${candidate.title}`);
  const song = parseVcpediaSong(payload(page), candidate, { singer });
  if (song.title === '你好，世界！') song.lyrics = '昏暗房间角落　指尖键盘上连击';
  added.push(song);
}

const resultPath = path.join(paths.outputDir, 'songs.normalized.json');
const result = JSON.parse(await readFile(resultPath, 'utf8'));
const byPage = new Map(result.songs
  .filter((song) => !(song.title === '你好，世界！' && song.vcpediaUrl.includes('/Template:')))
  .map((song) => [song.vcpediaUrl.replace(/#.*$/u, ''), song]));
for (const song of added) byPage.set(song.vcpediaUrl.replace(/#.*$/u, ''), song);
result.songs = [...byPage.values()].sort((a, b) => String(a.releaseMonth).localeCompare(String(b.releaseMonth), 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN'));
result.candidateCount = byPage.size;
result.annualReferenceCount = byPage.size;
result.generatedAt = new Date().toISOString();
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await writeFile(path.join(paths.outputDir, 'database-draft.json'), `${JSON.stringify(result.songs.map(({ title, staff, releaseMonth, singers, voicebanks, concertCount, special, lyrics, bilibiliUrl, vcpediaUrl }) => ({ title, staff, releaseMonth, singers, voicebanks, concertCount, special, lyrics, bilibiliUrl, vcpediaUrl })), null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ added: added.map(({ title, releaseMonth, singers, voicebanks }) => ({ title, releaseMonth, singers, voicebanks })) }, null, 2));
