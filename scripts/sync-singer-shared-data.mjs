import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSingerConfig, singerPaths } from './singer-config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const targetId = process.argv.find((value, index, args) => args[index - 1] === '--singer')
  ?? process.argv.find((value) => value.startsWith('--singer='))?.slice('--singer='.length);
if (!targetId) throw new Error('请使用 --singer <id> 指定要同步的歌姬');

const canonicalPage = (value) => decodeURIComponent(new URL(value).pathname)
  .replace(/\/+$/u, '').replaceAll('_', ' ').normalize('NFKC');
const factualFields = [
  'title', 'staff', 'releaseMonth', 'singers', 'voicebanks', 'concertCount',
  'special', 'lyrics', 'bilibiliUrl', 'vcpediaUrl',
];

const target = await loadSingerConfig(targetId);
const targetPath = singerPaths(target).reviewedData;
const targetSongs = JSON.parse(await readFile(targetPath, 'utf8'));
const priorityIds = ['luotianyi', 'yuezhengling', 'yanhe', 'zhiyu-moke'].filter((id) => id !== targetId);
const canonicalByPage = new Map();
for (const id of priorityIds) {
  const singer = await loadSingerConfig(id);
  const songs = JSON.parse(await readFile(singerPaths(singer).reviewedData, 'utf8'));
  for (const song of songs) {
    const key = canonicalPage(song.vcpediaUrl);
    if (!canonicalByPage.has(key)) canonicalByPage.set(key, song);
  }
}

let synchronized = 0;
const output = targetSongs.map((song) => {
  const canonical = canonicalByPage.get(canonicalPage(song.vcpediaUrl));
  if (!canonical) return song;
  synchronized += 1;
  return Object.fromEntries(factualFields.map((field) => [field, canonical[field]]));
});
await writeFile(targetPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`已同步 ${target.name}：${synchronized} 首共享歌曲采用既有曲库数据，${output.length - synchronized} 首保留本库数据`);
