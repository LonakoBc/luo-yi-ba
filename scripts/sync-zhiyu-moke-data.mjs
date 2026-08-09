import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSingerConfig, singerPaths } from './singer-config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const singer = await loadSingerConfig('zhiyu-moke');
const paths = singerPaths(singer);
const normalizedPath = path.join(paths.outputDir, 'songs.normalized.json');
const normalized = JSON.parse(await readFile(normalizedPath, 'utf8'));
const luotianyi = JSON.parse(await readFile(path.join(root, 'database', 'singers', 'luotianyi.json'), 'utf8'));
const yuezhengling = JSON.parse(await readFile(path.join(root, 'database', 'singers', 'yuezhengling.json'), 'utf8'));

const canonical = (value) => {
  const url = new URL(String(value ?? ''));
  return decodeURIComponent(url.pathname).replace(/^\/+|\/+$/gu, '').replaceAll('_', ' ').normalize('NFKC');
};
const byPage = (songs) => new Map(songs.map((song) => [canonical(song.vcpediaUrl), song]));
const luoByPage = byPage(luotianyi);
const yueByPage = byPage(yuezhengling);
const factFields = ['title', 'staff', 'releaseMonth', 'singers', 'voicebanks', 'concertCount', 'special', 'lyrics', 'bilibiliUrl', 'vcpediaUrl'];
let syncedWithLuo = 0;
let syncedWithYue = 0;
const songs = normalized.songs.map((song) => {
  const reference = luoByPage.get(canonical(song.vcpediaUrl)) ?? yueByPage.get(canonical(song.vcpediaUrl));
  if (!reference) return { ...song, syncSource: '本歌姬原始详情页' };
  if (luoByPage.has(canonical(song.vcpediaUrl))) syncedWithLuo += 1;
  else syncedWithYue += 1;
  return { ...song, ...Object.fromEntries(factFields.map((field) => [field, reference[field]])), syncSource: luoByPage.has(canonical(song.vcpediaUrl)) ? '洛天依审核表' : '乐正绫审核表' };
});

const outputSongs = songs.map(({ title, staff, releaseMonth, singers, voicebanks, concertCount, special, lyrics, bilibiliUrl, vcpediaUrl }) => ({ title, staff, releaseMonth, singers, voicebanks, concertCount, special, lyrics, bilibiliUrl, vcpediaUrl }));
await writeFile(path.join(root, 'database', 'singers', 'zhiyu-moke.json'), `${JSON.stringify(outputSongs, null, 2)}\n`, 'utf8');
await writeFile(normalizedPath, `${JSON.stringify({ ...normalized, songs }, null, 2)}\n`, 'utf8');
await writeFile(path.join(paths.outputDir, 'database-draft.json'), `${JSON.stringify(outputSongs, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ songCount: songs.length, syncedWithLuo, syncedWithYue, independent: songs.length - syncedWithLuo - syncedWithYue }, null, 2));
