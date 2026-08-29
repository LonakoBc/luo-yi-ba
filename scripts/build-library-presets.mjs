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

const HENIAN_SINGERS = new Set(['洛天依', '言和', '乐正绫', '乐正龙牙', '徵羽摩柯', '墨清弦']);
const MEDIUM5_SINGERS = new Set(['星尘', '海伊', '苍穹', '赤羽', '诗岸', '牧心', '永夜Minus']);

function normalizeSingerName(value) {
  return value === 'Minus' ? '永夜Minus' : value;
}

function singerMembers(song) {
  return String(song.singers).split('；').map((value) => normalizeSingerName(value.trim())).filter(Boolean);
}

function singersAreSubsetOf(song, allowed) {
  const members = singerMembers(song);
  return members.length > 0 && members.every((name) => allowed.has(name));
}

function uploaderMembers(song) {
  const uploader = String(song.staff).split('；').find((entry) => entry.trim().startsWith('UP主：'));
  return uploader ? uploader.replace(/^UP主：/u, '').split(/[、，,]/u).map((name) => name.trim()).filter(Boolean) : [];
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

  const luotianyi = libraries.find(({ singer }) => singer.id === 'luotianyi');
  const yuezhengling = libraries.find(({ singer }) => singer.id === 'yuezhengling');
  const yanhe = libraries.find(({ singer }) => singer.id === 'yanhe');
  if (!luotianyi?.songs.length || !yuezhengling?.songs.length) throw new Error('洛天依或乐正绫正式曲库缺失');
  if (!yanhe?.songs.length) throw new Error('言和正式曲库缺失');
  const goldenAge = allSongs.filter(({ releaseMonth }) => {
    const year = Number(releaseMonth.slice(0, 4));
    return year >= 2015 && year <= 2019;
  });
  const henian = allSongs.filter((song) => singersAreSubsetOf(song, HENIAN_SINGERS));
  const medium5 = allSongs.filter((song) => singersAreSubsetOf(song, MEDIUM5_SINGERS));
  const wangchuan = allSongs.filter((song) => uploaderMembers(song).includes('忘川风华录'));
  const expected = { all: 519, henian: 395, medium5: 101, wangchuan: 47, goldenAge: 199 };
  const actual = { all: allSongs.length, henian: henian.length, medium5: medium5.length, wangchuan: wangchuan.length, goldenAge: goldenAge.length };
  for (const [name, count] of Object.entries(expected)) {
    if (actual[name] !== count) throw new Error(`预设数量异常：${name} ${actual[name]} 首，预期 ${count} 首`);
  }

  await Promise.all([
    writeFile(path.join(root, 'presets', 'all.md'), presetMarkdown('挑战全曲库！', allSongs), 'utf8'),
    writeFile(path.join(root, 'presets', 'luotianyi.md'), presetMarkdown('洛天依经典曲目', luotianyi.songs), 'utf8'),
    writeFile(path.join(root, 'presets', 'yuezhengling.md'), presetMarkdown('乐正绫经典曲目', yuezhengling.songs), 'utf8'),
    writeFile(path.join(root, 'presets', 'yanhe.md'), presetMarkdown('言和经典曲目', yanhe.songs), 'utf8'),
    writeFile(path.join(root, 'presets', 'henian.md'), presetMarkdown('禾念系', henian), 'utf8'),
    writeFile(path.join(root, 'presets', 'medium5.md'), presetMarkdown('五维介质系', medium5), 'utf8'),
    writeFile(path.join(root, 'presets', 'wangchuan.md'), presetMarkdown('忘川风华录', wangchuan), 'utf8'),
    writeFile(path.join(root, 'presets', 'golden-age.md'), presetMarkdown('黄金时代', goldenAge), 'utf8'),
  ]);
  return { ...actual, yanhe: yanhe.songs.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.slice(1));
if (isMain) {
  const result = await rebuildLibraryPresets();
  console.log(`已重建预设：全曲库 ${result.all} 首，禾念系 ${result.henian} 首，五维介质系 ${result.medium5} 首，忘川风华录 ${result.wangchuan} 首，黄金时代 ${result.goldenAge} 首`);
}
