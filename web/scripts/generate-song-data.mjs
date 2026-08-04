import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  '曲名',
  'staff',
  '发布时间',
  '演唱歌姬',
  '使用声库',
  '演唱会\\生日会次数',
  '特殊标注',
  '歌词',
  '哔哩哔哩地址',
  '歌曲页面URL',
];
const VOICEBANKS = new Set(['VOCALOID', 'ACE Studio', 'X Studio', 'Synthesizer V']);
const SPECIALS = new Set(['单曲', '生贺曲', '拜年/贺岁纪曲目', '系列/企划曲目']);
const ROLE_PREFIX = /^(?:UP主|作曲|作词|编曲)\s*[：:]/u;

export function normalizeStaffName(value) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\p{P}\p{S}\s]/gu, '');
}

export function splitMembers(value) {
  return String(value).split('；').map((member) => member.trim()).filter(Boolean);
}

export function parseStaffPeople(staff, source = '歌曲文件') {
  const entries = staff.split('；').map((value) => value.trim()).filter(Boolean);
  if (!entries.length) throw new Error(`${source}: staff 为空`);

  return entries.flatMap((entry) => {
    if (!ROLE_PREFIX.test(entry)) throw new Error(`${source}: staff 项缺少可识别职责：${entry}`);
    const names = entry.replace(ROLE_PREFIX, '').trim().split(/[、,，/]/u).map((name) => name.trim()).filter(Boolean);
    if (!names.length) throw new Error(`${source}: staff 项缺少人员：${entry}`);
    return names;
  });
}

function parseFields(markdown, source) {
  const fields = new Map();
  for (const rawLine of markdown.replace(/^\uFEFF/u, '').split(/\r?\n/u)) {
    if (!rawLine.trim()) continue;
    const separator = rawLine.indexOf('：');
    if (separator < 1) throw new Error(`${source}: 无法解析行：${rawLine}`);
    const key = rawLine.slice(0, separator).trim();
    const value = rawLine.slice(separator + 1).trim();
    if (fields.has(key)) throw new Error(`${source}: 字段重复：${key}`);
    fields.set(key, value);
  }

  const missing = REQUIRED_FIELDS.filter((field) => !fields.get(field));
  if (missing.length) throw new Error(`${source}: 缺少字段：${missing.join('、')}`);
  const extras = [...fields.keys()].filter((field) => !REQUIRED_FIELDS.includes(field));
  if (extras.length) throw new Error(`${source}: 存在未知字段：${extras.join('、')}`);
  return fields;
}

export function parseSongMarkdown(markdown, id, source = id) {
  const fields = parseFields(markdown, source);
  const titleMatch = fields.get('曲名').match(/^《(.+)》$/u);
  if (!titleMatch) throw new Error(`${source}: 曲名必须使用《》包裹`);

  const releaseMonth = fields.get('发布时间');
  if (!/^20\d{2}-(?:0[1-9]|1[0-2])$/u.test(releaseMonth)) throw new Error(`${source}: 发布时间无效：${releaseMonth}`);

  const singersDisplay = fields.get('演唱歌姬');
  const singerMembers = splitMembers(singersDisplay);
  if (!singerMembers.length) throw new Error(`${source}: 演唱歌姬为空`);

  const voicebanksDisplay = fields.get('使用声库');
  const voicebankMembers = splitMembers(voicebanksDisplay);
  if (!voicebankMembers.length || voicebankMembers.some((value) => !VOICEBANKS.has(value))) {
    throw new Error(`${source}: 使用声库无效：${voicebanksDisplay}`);
  }

  const concertCount = Number(fields.get('演唱会\\生日会次数'));
  if (!Number.isInteger(concertCount) || concertCount < 0) throw new Error(`${source}: 演唱会\\生日会次数无效`);

  const special = fields.get('特殊标注');
  if (!SPECIALS.has(special)) throw new Error(`${source}: 特殊标注无效：${special}`);

  const bilibiliUrl = fields.get('哔哩哔哩地址');
  let parsedUrl;
  try {
    parsedUrl = new URL(bilibiliUrl);
  } catch {
    throw new Error(`${source}: 哔哩哔哩地址不是合法 URL`);
  }
  if (parsedUrl.protocol !== 'https:' || !/(^|\.)bilibili\.com$/iu.test(parsedUrl.hostname) || !parsedUrl.pathname.startsWith('/video/')) {
    throw new Error(`${source}: 哔哩哔哩地址必须是 HTTPS 视频页`);
  }

  const vcpediaUrl = fields.get('歌曲页面URL');
  let parsedVcpediaUrl;
  try {
    parsedVcpediaUrl = new URL(vcpediaUrl);
  } catch {
    throw new Error(`${source}: 歌曲页面URL不是合法 URL`);
  }
  if (parsedVcpediaUrl.protocol !== 'https:' || parsedVcpediaUrl.hostname !== 'vcpedia.cn') {
    throw new Error(`${source}: 歌曲页面URL必须是 VCPedia HTTPS 页面`);
  }

  const staffDisplay = fields.get('staff');
  return {
    id,
    title: titleMatch[1],
    staffDisplay,
    staffPeople: [...new Set(parseStaffPeople(staffDisplay, source).map(normalizeStaffName))],
    releaseMonth,
    singersDisplay,
    singerMembers,
    voicebanksDisplay,
    voicebankMembers,
    concertCount,
    special,
    lyrics: fields.get('歌词'),
    bilibiliUrl,
    vcpediaUrl,
  };
}

export async function generateSongData({ songDirectory, outputFile }) {
  const entries = (await fs.readdir(songDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  if (!entries.length) throw new Error(`题库目录中没有 Markdown：${songDirectory}`);

  const songs = [];
  const ids = new Set();
  const titles = new Set();
  for (const entry of entries) {
    const id = entry.name.slice(0, -3);
    const source = path.join(songDirectory, entry.name);
    const song = parseSongMarkdown(await fs.readFile(source, 'utf8'), id, source);
    const titleKey = song.title.normalize('NFKC').toLocaleLowerCase('zh-CN');
    if (ids.has(id)) throw new Error(`${source}: ID 重复：${id}`);
    if (titles.has(titleKey)) throw new Error(`${source}: 曲名重复：${song.title}`);
    ids.add(id);
    titles.add(titleKey);
    songs.push(song);
  }

  songs.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const output = `${JSON.stringify(songs, null, 2)}\n`;
  const existing = await fs.readFile(outputFile, 'utf8').catch(() => null);
  if (existing !== output) await fs.writeFile(outputFile, output, 'utf8');
  return songs;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const songDirectory = path.resolve(webRoot, '..', 'song', 'song_luotianyi');
  const outputFile = path.resolve(webRoot, 'src', 'data', 'songs.generated.json');
  const songs = await generateSongData({ songDirectory, outputFile });
  console.log(`已生成 ${songs.length} 首歌曲：${outputFile}`);
}
