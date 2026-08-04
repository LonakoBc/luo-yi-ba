import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRESET_META = {
  intro: { description: '精选 50 首热门与出圈作品' },
  luotianyi: { description: '完整洛天依传说曲资料库' },
  'golden-age': { description: '2015 至 2019 年投稿作品' },
};

export function parsePresetMarkdown(markdown, id, source = id) {
  const lines = String(markdown).replace(/^\uFEFF/u, '').split(/\r?\n/u);
  const name = lines.find((line) => /^#\s+\S/u.test(line))?.replace(/^#\s+/u, '').trim();
  if (!name) throw new Error(`${source}: 缺少一级标题`);
  const titles = lines.filter((line) => /^-\s+\S/u.test(line)).map((line) => line.replace(/^-\s+/u, '').trim());
  if (!titles.length) throw new Error(`${source}: 预设曲库为空`);
  const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index);
  if (duplicates.length) throw new Error(`${source}: 曲名重复：${[...new Set(duplicates)].join('、')}`);
  return { id, name, description: PRESET_META[id]?.description ?? '', titles };
}

export async function generatePresetData({ presetDirectory, songsFile, outputFile }) {
  const songs = JSON.parse(await fs.readFile(songsFile, 'utf8'));
  const songTitles = new Set(songs.map((song) => song.title));
  const entries = (await fs.readdir(presetDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const presets = [];
  for (const entry of entries) {
    const id = entry.name.slice(0, -3);
    const source = path.join(presetDirectory, entry.name);
    const preset = parsePresetMarkdown(await fs.readFile(source, 'utf8'), id, source);
    const missing = preset.titles.filter((title) => !songTitles.has(title));
    if (missing.length) throw new Error(`${source}: 题库中缺少：${missing.join('、')}`);
    presets.push(preset);
  }
  for (const required of Object.keys(PRESET_META)) {
    if (!presets.some((preset) => preset.id === required)) throw new Error(`缺少预设文件：${required}.md`);
  }
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(presets, null, 2)}\n`, 'utf8');
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
