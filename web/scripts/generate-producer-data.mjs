import XLSX from 'xlsx';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const defaultInput = path.resolve(webRoot, '..', 'producers', 'P主代表曲统计表(1).xlsx');
const defaultOutput = path.resolve(webRoot, 'src', 'data', 'producers.generated.json');
const headers = ['序号', 'P主', '初投稿时间', '出道曲', '代表曲A', '代表曲B', '代表曲C', '代表曲D', '代表曲E', '殿堂曲数量', '传说曲数量', '神话曲数量', '名P'];

export function normalizeProducerName(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\p{P}\p{S}\s]+/gu, '');
}

function text(value) {
  return String(value ?? '').trim();
}

function integer(rawValue, label, rowNumber) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) throw new Error(`第 ${rowNumber} 行“${label}”必须是非负整数`);
  return value;
}

function dateParts(value, rowNumber) {
  if (typeof value === 'number') {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) throw new Error(`第 ${rowNumber} 行“初投稿时间”不是合法日期`);
    return { date: `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`, year: parts.y };
  }
  const date = value instanceof Date ? value : new Date(String(value).replace(/年|月/g, '-').replace(/日/g, ''));
  if (Number.isNaN(date.getTime())) throw new Error(`第 ${rowNumber} 行“初投稿时间”不是合法日期`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, year };
}

function aliasesFromName(name) {
  const aliases = [];
  for (const match of name.matchAll(/[（(]([^）)]+)[）)]/gu)) {
    aliases.push(...match[1].split(/[、,，/]/u).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(aliases)];
}

export async function generateProducerData({ input = defaultInput, output = defaultOutput, assertCounts = true } = {}) {
  const workbook = XLSX.readFile(input, { cellDates: false });
  const sheet = workbook.Sheets.Sheet1;
  if (!sheet) throw new Error('P 主工作簿缺少 Sheet1');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const actualHeaders = headers.map((_, index) => text(rows[0]?.[index]));
  if (actualHeaders.some((value, index) => value !== headers[index])) throw new Error(`P 主工作表列标题不匹配：${actualHeaders.join('、')}`);

  const producers = [];
  const names = new Set();
  const ids = new Set();
  for (let rowNumber = 2; rowNumber <= rows.length; rowNumber += 1) {
    const row = rows[rowNumber - 1];
    if (!text(row?.[1])) continue;
    const name = text(row[1]);
    if (names.has(name)) throw new Error(`P 主名称重复：${name}`);
    names.add(name);
    const id = normalizeProducerName(name);
    if (!id || ids.has(id)) throw new Error(`P 主 ID 重复或为空：${name}`);
    ids.add(id);
    const debut = dateParts(row[2], rowNumber);
    const representativeSongs = [4, 5, 6, 7, 8].map((column) => text(row[column]));
    if (representativeSongs.some((song) => !song)) throw new Error(`第 ${rowNumber} 行代表曲不得为空`);
    if (new Set(representativeSongs.map(normalizeProducerName)).size !== 5) throw new Error(`第 ${rowNumber} 行代表曲存在重复：${name}`);
    const famous = integer(row[12], '名P', rowNumber);
    if (![0, 1].includes(famous)) throw new Error(`第 ${rowNumber} 行“名P”只能为 0 或 1`);
    const aliases = aliasesFromName(name);
    producers.push({
      id,
      name,
      aliases,
      searchKeys: [name, ...aliases].map(normalizeProducerName),
      debutDate: debut.date,
      debutYear: debut.year,
      debutSong: text(row[3]),
      representativeSongs,
      hallCount: integer(row[9], '殿堂曲数量', rowNumber),
      legendCount: integer(row[10], '传说曲数量', rowNumber),
      mythCount: integer(row[11], '神话曲数量', rowNumber),
      famous: famous === 1,
    });
  }
  const famousCount = producers.filter((producer) => producer.famous).length;
  if (assertCounts && (producers.length !== 104 || famousCount !== 45)) throw new Error(`P 主规模校验失败：共 ${producers.length} 位，名 P ${famousCount} 位（预期 104/45）`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(producers, null, 2)}\n`, 'utf8');
  console.log(`Generated ${producers.length} producers (${famousCount} famous) -> ${path.relative(webRoot, output)}`);
  return producers;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateProducerData().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
