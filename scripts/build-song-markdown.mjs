import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pinyin } from 'pinyin-pro';
import { loadSingerConfig, singerIdFromArgs, singerPaths } from './singer-config.mjs';


// 多音字曲名需要固定读音，避免依赖拼音库的默认词频判断。
const TITLE_SLUG_OVERRIDES = new Map([
  ['乐鸣东方', 'yue-ming-dong-fang'],
]);

export function slugifyTitle(title) {
  const override = TITLE_SLUG_OVERRIDES.get(title);
  if (override) return override;
  return pinyin(title, { toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .join('-')
    .toLowerCase()
    .replaceAll('ü', 'v')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'unknown-song';
}

function cleanField(value) {
  return String(value ?? '').replace(/[\r\n]+/gu, ' ').replace(/\s{2,}/gu, ' ').trim();
}

function markdownFor(song, allowedVoicebanks) {
  const releaseMonth = cleanField(song.releaseMonth);
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(releaseMonth)) {
    throw new Error(`《${song.title}》发布时间无效：${song.releaseMonth}`);
  }
  const voicebanks = cleanField(song.voicebanks).split('；').filter(Boolean);
  if (!voicebanks.length || voicebanks.some((voicebank) => !allowedVoicebanks.includes(voicebank))) {
    throw new Error(`《${song.title}》使用了范围外声库：${song.voicebanks}`);
  }
  const fields = {
    曲名: `《${cleanField(song.title)}》`,
    staff: cleanField(song.staff),
    发布时间: releaseMonth,
    演唱歌姬: cleanField(song.singers),
    使用声库: cleanField(song.voicebanks),
    '演唱会\\生日会次数': cleanField(song.concertCount),
    特殊标注: cleanField(song.special),
    歌词: cleanField(song.lyrics),
    哔哩哔哩地址: cleanField(song.bilibiliUrl),
    歌曲页面URL: cleanField(song.vcpediaUrl),
  };
  for (const [field, value] of Object.entries(fields)) {
    if (!value) throw new Error(`《${song.title}》缺少字段：${field}`);
  }
  return `${Object.entries(fields).map(([field, value]) => `${field}：${value}`).join('\n')}\n`;
}

async function deleteMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) await unlink(path.join(directory, entry.name));
  }
}

export async function rebuildSongLibrary({ singerId = singerIdFromArgs(), inputPath, outputDirectory } = {}) {
  const singer = await loadSingerConfig(singerId);
  const paths = singerPaths(singer);
  const resolvedInput = inputPath ?? paths.reviewedData;
  const resolvedOutput = outputDirectory ?? paths.songDirectory;
  const songs = JSON.parse(await readFile(resolvedInput, 'utf8'));
  if (!Array.isArray(songs) || !songs.length) throw new Error('审核数据中没有歌曲');
  await mkdir(resolvedOutput, { recursive: true });

  await deleteMarkdownFiles(resolvedOutput);

  const slugCounts = new Map();
  const files = [];
  for (const song of songs) {
    const baseSlug = slugifyTitle(song.title);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;
    const filename = `${slug}.md`;
    await writeFile(path.join(resolvedOutput, filename), markdownFor(song, singer.allowedVoicebanks), 'utf8');
    files.push({ title: song.title, filename });
  }
  return { singer, outputDirectory: resolvedOutput, count: files.length, files, collisions: [...slugCounts].filter(([, count]) => count > 1) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.slice(1));
if (isMain) {
  const result = await rebuildSongLibrary();
  console.log(`已重建 ${result.singer.name} ${result.count} 首：${result.outputDirectory}`);
  if (result.collisions.length) console.log(`拼音冲突：${result.collisions.map(([slug, count]) => `${slug}×${count}`).join('、')}`);
}
