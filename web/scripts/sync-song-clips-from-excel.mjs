import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const defaultInputPath = path.join(repoRoot, 'guess_songs', 'music-guess-song-clips.xlsx');
const defaultCatalogPath = path.join(repoRoot, 'guess_songs', 'catalogs', 'song-clips.json');
const defaultManifestPath = path.join(repoRoot, 'web', 'src', 'data', 'musicGuessManifest.js');

const REQUIRED_HEADERS = [
  'sourceKey',
  'clipFile',
  'startSeconds',
  'durationSeconds',
  'fullFifteenSeconds',
  'playlistIds',
];

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    values.set(key, inlineValue ?? argv[index + 1]);
    if (inlineValue === undefined) index += 1;
  }
  return values;
}

function toNumber(value, field, rowNumber) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('第 ' + rowNumber + ' 行的 ' + field + ' 不是有效数字：' + value);
  }
  return number;
}

function parsePlaylistIds(value, rowNumber) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  const text = String(value ?? '').trim();
  if (!text) throw new Error('第 ' + rowNumber + ' 行的 playlistIds 为空');
  let ids;
  try {
    ids = JSON.parse(text);
  } catch {
    throw new Error('第 ' + rowNumber + ' 行的 playlistIds 必须是 JSON 数组，例如 ["luotianyi","yanhe"]');
  }
  if (!Array.isArray(ids)) throw new Error('第 ' + rowNumber + ' 行的 playlistIds 必须是 JSON 数组');
  const normalized = [...new Set(ids.map((item) => String(item).trim()).filter(Boolean))];
  if (!normalized.length) throw new Error('第 ' + rowNumber + ' 行的 playlistIds 不能为空');
  if (normalized.some((id) => !/^[a-z0-9-]+$/u.test(id))) {
    throw new Error('第 ' + rowNumber + ' 行的 playlistIds 含有非法 ID：' + normalized.join(', '));
  }
  return normalized;
}

function readRows(inputPath) {
  const workbook = XLSX.readFile(inputPath, { cellDates: false });
  const sheet = workbook.Sheets['song-clips'] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Excel 中没有可用工作表：' + inputPath);
  const rows = XLSX.utils.sheet_to_json(sheet, { range: 3, defval: null });
  if (!rows.length) throw new Error('Excel 中没有数据行：' + inputPath);

  const headers = Object.keys(rows[0]);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error('Excel 缺少字段：' + missingHeaders.join(', '));

  const sourceKeys = new Set();
  const clipFiles = new Set();
  return rows.map((row, index) => {
    const rowNumber = index + 5;
    const sourceKey = String(row.sourceKey ?? '').trim();
    const clipFile = String(row.clipFile ?? '').trim();
    if (!sourceKey) throw new Error('第 ' + rowNumber + ' 行的 sourceKey 为空');
    if (!clipFile) throw new Error('第 ' + rowNumber + ' 行的 clipFile 为空');
    if (sourceKeys.has(sourceKey)) throw new Error('sourceKey 重复：' + sourceKey + '（第 ' + rowNumber + ' 行）');
    if (clipFiles.has(clipFile)) throw new Error('clipFile 重复：' + clipFile + '（第 ' + rowNumber + ' 行）');
    sourceKeys.add(sourceKey);
    clipFiles.add(clipFile);

    const startSeconds = toNumber(row.startSeconds, 'startSeconds', rowNumber);
    const durationSeconds = toNumber(row.durationSeconds, 'durationSeconds', rowNumber);
    if (startSeconds < 0) throw new Error('第 ' + rowNumber + ' 行的 startSeconds 不能小于 0');
    if (durationSeconds <= 0 || durationSeconds > 15.1) throw new Error('第 ' + rowNumber + ' 行的 durationSeconds 超出范围：' + durationSeconds);
    const fullFifteenSeconds = durationSeconds >= 14.9;
    if (row.fullFifteenSeconds !== null && row.fullFifteenSeconds !== undefined && row.fullFifteenSeconds !== '') {
      const supplied = row.fullFifteenSeconds === true
        || String(row.fullFifteenSeconds).trim().toLowerCase() === 'true'
        || String(row.fullFifteenSeconds).trim() === '1';
      if (supplied !== fullFifteenSeconds) {
        throw new Error('第 ' + rowNumber + ' 行的 fullFifteenSeconds 与 durationSeconds 不一致');
      }
    }

    return {
      sourceKey,
      clipFile,
      startSeconds,
      durationSeconds,
      fullFifteenSeconds,
      playlistIds: parsePlaylistIds(row.playlistIds, rowNumber),
    };
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, ''));
}

function getExistingTrackMaps(existingTracks) {
  const bySourceKey = new Map();
  const byClipFile = new Map();
  for (const track of existingTracks) {
    if (track.sourceKey) bySourceKey.set(String(track.sourceKey), track);
    if (track.clipFile) byClipFile.set(String(track.clipFile), track);
  }
  return { bySourceKey, byClipFile };
}

function buildTrack(row, existing) {
  const sourceFile = existing?.sourceFile || (row.sourceKey + '.mp3');
  const sourceTitle = existing?.sourceTitle || row.sourceKey;
  const sourceSha256 = row.clipFile.match(/^asset-([a-f0-9]{12})-/iu)?.[1] || existing?.sourceSha256 || '';
  const clipPath = existing?.clipFile === row.clipFile && existing?.clipPath
    ? existing.clipPath
    : ('assets/' + row.clipFile);
  return {
    ...(existing || {}),
    sourceKey: row.sourceKey,
    sourceFile,
    sourceTitle,
    ...(sourceSha256 ? { sourceSha256 } : {}),
    startSeconds: row.startSeconds,
    durationSeconds: row.durationSeconds,
    clipFile: row.clipFile,
    clipPath,
    fullFifteenSeconds: row.fullFifteenSeconds,
    playlistIds: row.playlistIds,
  };
}

function buildCatalogDocument(existingDocument, rows) {
  const existingTracks = Array.isArray(existingDocument?.tracks) ? existingDocument.tracks : [];
  const { bySourceKey, byClipFile } = getExistingTrackMaps(existingTracks);
  const tracks = rows.map((row) => {
    const existingByKey = bySourceKey.get(row.sourceKey);
    const existingByFile = byClipFile.get(row.clipFile);
    if (existingByKey && existingByFile && existingByKey !== existingByFile) {
      throw new Error('Excel 中的 sourceKey 与 clipFile 分别指向不同旧记录：' + row.sourceKey + ' / ' + row.clipFile);
    }
    return buildTrack(row, existingByKey || existingByFile);
  });
  const specialStarts = Object.fromEntries(
    tracks
      .filter((track) => Number(track.startSeconds) > 0)
      .map((track) => [track.sourceFile || track.sourceKey, track.startSeconds]),
  );
  return {
    ...(existingDocument || {}),
    playlist: 'local-catalog',
    sourceDirectory: 'guess_songs/*',
    clipDirectory: 'guess_songs/assets',
    clipLengthSeconds: 15,
    generatedAt: new Date().toISOString(),
    count: tracks.length,
    specialStarts,
    tracks,
  };
}

function buildManifestModule(tracks) {
  const entries = tracks.map((track) => ({
    playlistIds: track.playlistIds,
    sourceKey: track.sourceKey,
    fileName: track.clipFile,
    sourceName: track.sourceFile || ((track.sourceTitle || track.sourceKey) + '.mp3'),
    durationSeconds: track.durationSeconds,
  }));
  return 'export const MUSIC_GUESS_CLIP_MANIFEST = Object.freeze([\n'
    + entries.map((entry) => '  Object.freeze(' + JSON.stringify(entry) + '),').join('\n')
    + '\n]);\n';
}

export function syncSongClipsFromExcel({
  inputPath = defaultInputPath,
  catalogPath = defaultCatalogPath,
  manifestPath = defaultManifestPath,
} = {}) {
  if (!fs.existsSync(inputPath)) throw new Error('找不到 Excel：' + inputPath);
  if (!fs.existsSync(catalogPath)) throw new Error('找不到现有曲库 JSON：' + catalogPath);
  const rows = readRows(inputPath);
  const assetsDir = path.join(repoRoot, 'guess_songs', 'assets');
  const missingAssets = rows
    .map((row) => row.clipFile)
    .filter((clipFile) => !fs.existsSync(path.join(assetsDir, clipFile)));
  if (missingAssets.length) {
    throw new Error('Excel 中有 ' + missingAssets.length + ' 个片段文件不存在于 guess_songs/assets，例如：' + missingAssets.slice(0, 5).join(', '));
  }

  const existingDocument = readJson(catalogPath);
  const document = buildCatalogDocument(existingDocument, rows);
  fs.writeFileSync(catalogPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  fs.writeFileSync(manifestPath, buildManifestModule(document.tracks), 'utf8');
  return {
    count: document.tracks.length,
    catalogPath,
    manifestPath,
  };
}

const args = parseArgs(process.argv.slice(2));
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = syncSongClipsFromExcel({
      inputPath: args.get('input') || defaultInputPath,
      catalogPath: args.get('catalog') || defaultCatalogPath,
      manifestPath: args.get('manifest') || defaultManifestPath,
    });
    console.log('已从 Excel 同步 ' + result.count + ' 条曲目。');
    console.log('JSON：' + result.catalogPath);
    console.log('Manifest：' + result.manifestPath);
  } catch (error) {
    console.error('同步失败：' + error.message);
    process.exitCode = 1;
  }
}
