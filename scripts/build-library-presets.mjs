import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSingerCatalog, singerPaths } from './singer-config.mjs';

const root = path.resolve(import.meta.dirname, '..');

function canonicalPage(value) {
  const url = new URL(value);
  return decodeURIComponent(url.pathname).replace(/\/+$/u, '').replaceAll('_', ' ').normalize('NFKC');
}

function presetMarkdown(title, songs) {
  return `# ${title}\n\n${songs.map((song) => `- ${song.title}`).join('\n')}\n`;
}

export async function rebuildLibraryPresets() {
  const catalog = await loadSingerCatalog();
  const libraries = [];
  for (const singer of catalog.singers.filter(({ published }) => published)) {
    const songs = JSON.parse(await readFile(singerPaths(singer).reviewedData, 'utf8'));
    libraries.push({ singer, songs });
  }

  const allByPage = new Map();
  for (const { songs } of libraries) {
    for (const song of songs) if (!allByPage.has(canonicalPage(song.vcpediaUrl))) allByPage.set(canonicalPage(song.vcpediaUrl), song);
  }
  const allSongs = [...allByPage.values()].sort((left, right) => left.releaseMonth.localeCompare(right.releaseMonth) || left.title.localeCompare(right.title, 'zh-CN'));
  if (new Set(allSongs.map(({ title }) => title)).size !== allSongs.length) throw new Error('全局曲库存在不同页面的同名歌曲，Markdown 预设无法唯一定位');

  const yanhe = libraries.find(({ singer }) => singer.id === 'yanhe');
  if (!yanhe || yanhe.songs.length !== 51) throw new Error('言和正式曲库缺失或数量不是 51 首');
  const goldenAge = allSongs.filter(({ releaseMonth }) => {
    const year = Number(releaseMonth.slice(0, 4));
    return year >= 2015 && year <= 2019;
  });
  if (allSongs.length !== 251) throw new Error(`预设数量异常：全曲库 ${allSongs.length} 首`);

  await Promise.all([
    writeFile(path.join(root, 'presets', 'all.md'), presetMarkdown('挑战全曲库！', allSongs), 'utf8'),
    writeFile(path.join(root, 'presets', 'yanhe.md'), presetMarkdown('言和传说曲', yanhe.songs), 'utf8'),
    writeFile(path.join(root, 'presets', 'golden-age.md'), presetMarkdown('黄金时代', goldenAge), 'utf8'),
  ]);
  return { all: allSongs.length, yanhe: yanhe.songs.length, goldenAge: goldenAge.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.slice(1));
if (isMain) {
  const result = await rebuildLibraryPresets();
  console.log(`已重建预设：全曲库 ${result.all} 首，言和 ${result.yanhe} 首，黄金时代 ${result.goldenAge} 首`);
}
