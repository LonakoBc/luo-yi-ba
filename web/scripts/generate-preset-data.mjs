import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRESET_META = {
  all: { description: '完整收录全部已发布歌姬的传说曲' },
  intro: { description: '精选 50 首热门与出圈的洛天依作品', badge: { text: '洛', color: '#66CCFF' } },
  luotianyi: { description: '完整洛天依传说曲资料库', badge: { text: '洛', color: '#66CCFF' } },
  yuezhengling: { description: '完整乐正绫传说曲资料库', badge: { text: '绫', color: '#EE0000' } },
  'golden-age': { description: '全部歌姬 2015 至 2019 年投稿作品' },
};

const PRESET_ORDER = ['all', 'intro', 'luotianyi', 'yuezhengling', 'golden-age'];

export function parsePresetMarkdown(markdown, id, source = id) {
  const lines = String(markdown).replace(/^\uFEFF/u, '').split(/\r?\n/u);
  const name = lines.find((line) => /^#\s+\S/u.test(line))?.replace(/^#\s+/u, '').trim();
  if (!name) throw new Error(`${source}: 缺少一级标题`);
  const titles = lines.filter((line) => /^-\s+\S/u.test(line)).map((line) => line.replace(/^-\s+/u, '').trim());
  if (!titles.length) throw new Error(`${source}: 预设曲库为空`);
  const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
  if (duplicates.length) throw new Error(`${source}: 曲名重复：${[...new Set(duplicates)].join('、')}`);
  return { id, name, description: PRESET_META[id]?.description ?? '', badge: PRESET_META[id]?.badge ?? null, titles };
}

async function writeIfChanged(file, content) {
  try {
    if (await fs.readFile(file, 'utf8') === content) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(file, content, 'utf8');
  return true;
}

export async function generatePresetData({ presetDirectory, songsFile, outputFile }) {
  const songs = JSON.parse(await fs.readFile(songsFile, 'utf8'));
  const songsByTitle = new Map();
  for (const song of songs) songsByTitle.set(song.title, [...(songsByTitle.get(song.title) ?? []), song]);
  const entries = (await fs.readdir(presetDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((a, b) => {
      const left = PRESET_ORDER.indexOf(a.name.slice(0, -3));
      const right = PRESET_ORDER.indexOf(b.name.slice(0, -3));
      return (left < 0 ? Number.MAX_SAFE_INTEGER : left) - (right < 0 ? Number.MAX_SAFE_INTEGER : right)
        || a.name.localeCompare(b.name, 'zh-CN');
    });
  const presets = [];
  for (const entry of entries) {
    const id = entry.name.slice(0, -3);
    const source = path.join(presetDirectory, entry.name);
    const preset = parsePresetMarkdown(await fs.readFile(source, 'utf8'), id, source);
    const missing = preset.titles.filter((title) => !songsByTitle.has(title));
    if (missing.length) throw new Error(`${source}: 题库中缺少：${missing.join('、')}`);
    const ambiguous = preset.titles.filter((title) => songsByTitle.get(title).length > 1);
    if (ambiguous.length) throw new Error(`${source}: 存在跨歌姬同名歌曲，预设必须改用唯一标识：${ambiguous.join('、')}`);
    presets.push({ ...preset, songIds: preset.titles.map((title) => songsByTitle.get(title)[0].id) });
  }
  for (const required of Object.keys(PRESET_META)) {
    if (!presets.some((preset) => preset.id === required)) throw new Error(`缺少预设文件：${required}.md`);
  }
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await writeIfChanged(outputFile, `${JSON.stringify(presets, null, 2)}\n`);
  return presets;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const presets = await generatePresetData({
    presetDirectory: path.resolve(webRoot, '..', 'presets'),
    songsFile: path.resolve(webRoot, 'src', 'data', 'songs.generated.json'),
    outputFile: path.resolve(webRoot, 'src', 'data', 'presets.generated.json'),
  });
  console.log(`已生成 ${presets.length} 个曲库预设`);
}
