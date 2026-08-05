import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DEFAULT_SINGER_CATALOG = path.join(ROOT, 'singers', 'catalog.json');

export function singerIdFromArgs(argv = process.argv.slice(2), fallback = 'luotianyi') {
  const inline = argv.find((argument) => argument.startsWith('--singer='));
  if (inline) return inline.slice('--singer='.length);
  const index = argv.indexOf('--singer');
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

export async function loadSingerCatalog(catalogPath = DEFAULT_SINGER_CATALOG) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (!Array.isArray(catalog.allowedVoicebanks) || !catalog.allowedVoicebanks.length) throw new Error('歌姬配置缺少允许的声库列表');
  if (!Array.isArray(catalog.singers) || !catalog.singers.length) throw new Error('歌姬配置目录为空');
  const ids = new Set();
  for (const singer of catalog.singers) {
    const required = ['id', 'name', 'shortName', 'themeColor', 'profileUrl', 'templatePrefix', 'startYear', 'birthday', 'reviewedData', 'songDirectory'];
    const missing = required.filter((field) => singer[field] === undefined || singer[field] === '');
    if (missing.length) throw new Error(`${singer.id ?? '未知歌姬'}缺少配置：${missing.join('、')}`);
    if (!/^[a-z0-9-]+$/u.test(singer.id) || ids.has(singer.id)) throw new Error(`歌姬 ID 无效或重复：${singer.id}`);
    if (!/^#[0-9A-F]{6}$/iu.test(singer.themeColor)) throw new Error(`${singer.name}主题色无效`);
    if (!/^\d{2}-\d{2}$/u.test(singer.birthday)) throw new Error(`${singer.name}生日必须使用 MM-DD`);
    ids.add(singer.id);
  }
  return catalog;
}

export async function loadSingerConfig(id, catalogPath = DEFAULT_SINGER_CATALOG) {
  const catalog = await loadSingerCatalog(catalogPath);
  const singer = catalog.singers.find((entry) => entry.id === id);
  if (!singer) throw new Error(`未知歌姬：${id}；可用值：${catalog.singers.map((entry) => entry.id).join('、')}`);
  return { ...singer, allowedVoicebanks: [...catalog.allowedVoicebanks] };
}

export function singerYears(singer, currentYear = new Date().getFullYear()) {
  const endYear = singer.endYear ?? currentYear;
  return Array.from({ length: endYear - singer.startYear + 1 }, (_, index) => singer.startYear + index);
}

export function singerPaths(singer) {
  return {
    cacheDir: path.join(ROOT, '.cache', 'vcpedia', singer.id),
    outputDir: path.join(ROOT, 'outputs', 'vcpedia-crawl', singer.id),
    reviewedData: path.resolve(ROOT, singer.reviewedData),
    songDirectory: path.resolve(ROOT, singer.songDirectory),
  };
}
