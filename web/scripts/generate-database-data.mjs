import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  'title', 'staff', 'releaseMonth', 'singers', 'voicebanks', 'concertCount',
  'special', 'lyrics', 'bilibiliUrl', 'vcpediaUrl',
];

export function splitDatabaseMembers(value) {
  return String(value).split('；').map((item) => item.trim()).filter(Boolean);
}

function validateUrl(value, hostname, label, source, pathPrefix = '') {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${source}: ${label}不是合法 URL`);
  }
  if (url.protocol !== 'https:' || url.hostname !== hostname || (pathPrefix && !url.pathname.startsWith(pathPrefix))) {
    throw new Error(`${source}: ${label}地址无效`);
  }
}

export function normalizeDatabaseSong(song, index, singerName, source = `第 ${index + 1} 条`) {
  const missing = REQUIRED_FIELDS.filter((field) => song[field] === undefined || song[field] === null || String(song[field]).trim() === '');
  if (missing.length) throw new Error(`${source}: 缺少字段：${missing.join('、')}`);
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(song.releaseMonth)) throw new Error(`${source}: 发布时间无效：${song.releaseMonth}`);
  if (!Number.isInteger(song.concertCount) || song.concertCount < 0) throw new Error(`${source}: 演唱会/生日会次数无效`);

  const singerMembers = splitDatabaseMembers(song.singers);
  const voicebankMembers = splitDatabaseMembers(song.voicebanks);
  if (!singerMembers.includes(singerName)) throw new Error(`${source}: 演唱歌姬中不包含${singerName}`);
  if (!voicebankMembers.length) throw new Error(`${source}: 使用声库为空`);
  validateUrl(song.bilibiliUrl, 'www.bilibili.com', 'Bilibili', source, '/video/');
  validateUrl(song.vcpediaUrl, 'vcpedia.cn', 'VCPedia', source);

  return {
    index: index + 1,
    title: String(song.title).trim(),
    staff: String(song.staff).trim(),
    releaseMonth: song.releaseMonth,
    singers: String(song.singers).trim(),
    singerMembers,
    voicebanks: String(song.voicebanks).trim(),
    voicebankMembers,
    concertCount: song.concertCount,
    special: String(song.special).trim(),
    lyrics: String(song.lyrics).trim(),
    bilibiliUrl: song.bilibiliUrl,
    vcpediaUrl: song.vcpediaUrl,
  };
}

export async function generateDatabaseData({ catalogFile, singerCatalogFile, databaseRoot, outputFile }) {
  const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
  const singerCatalog = JSON.parse(await fs.readFile(singerCatalogFile ?? path.resolve(databaseRoot, '..', 'singers', 'catalog.json'), 'utf8'));
  const singerConfigs = new Map((singerCatalog.singers ?? []).map((singer) => [singer.id, singer]));
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('数据库歌姬目录为空');

  const ids = new Set();
  const libraries = {};
  const generatedCatalog = [];
  for (const entry of catalog) {
    if (!/^[a-z0-9-]+$/u.test(entry.id ?? '') || !entry.file) throw new Error('歌姬目录项缺少合法的 id 或 file');
    if (ids.has(entry.id)) throw new Error(`歌姬 ID 重复：${entry.id}`);
    ids.add(entry.id);
    const singer = singerConfigs.get(entry.id);
    if (!singer) throw new Error(`数据库歌姬未在全局配置中登记：${entry.id}`);
    if (!singer.published) throw new Error(`${singer.name}尚未标记为已发布，不能加入数据库目录`);

    const resolvedFile = path.resolve(databaseRoot, entry.file);
    const relative = path.relative(databaseRoot, resolvedFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${entry.name}: 数据文件必须位于 database 目录内`);
    const rawSongs = JSON.parse(await fs.readFile(resolvedFile, 'utf8'));
    if (!Array.isArray(rawSongs) || !rawSongs.length) throw new Error(`${singer.name}: 歌曲数据为空`);
    if (rawSongs.length !== entry.expectedSongCount) {
      throw new Error(`${singer.name}: 目录声明 ${entry.expectedSongCount} 首，实际 ${rawSongs.length} 首`);
    }

    const titles = new Set();
    const songs = rawSongs.map((song, index) => {
      const normalized = normalizeDatabaseSong(song, index, singer.name, `${entry.file} 第 ${index + 1} 条`);
      const titleKey = normalized.title.normalize('NFKC').toLocaleLowerCase('zh-CN');
      if (titles.has(titleKey)) throw new Error(`${singer.name}: 曲名重复：${normalized.title}`);
      titles.add(titleKey);
      return normalized;
    });
    libraries[entry.id] = songs;
    generatedCatalog.push({
      id: entry.id,
      name: singer.name,
      shortName: singer.shortName,
      themeColor: singer.themeColor,
      profileUrl: singer.profileUrl,
      songCount: songs.length,
    });
  }

  const result = { catalog: generatedCatalog, libraries };
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  const existing = await fs.readFile(outputFile, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing !== output) await fs.writeFile(outputFile, output, 'utf8');
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const databaseRoot = path.resolve(webRoot, '..', 'database');
  const result = await generateDatabaseData({
    catalogFile: path.join(databaseRoot, 'catalog.json'),
    singerCatalogFile: path.resolve(webRoot, '..', 'singers', 'catalog.json'),
    databaseRoot,
    outputFile: path.join(webRoot, 'src', 'data', 'database.generated.json'),
  });
  console.log(`已生成 ${result.catalog.length} 个歌姬数据库，共 ${Object.values(result.libraries).reduce((sum, songs) => sum + songs.length, 0)} 首记录`);
}
