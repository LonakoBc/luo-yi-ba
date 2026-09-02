import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const songFile = path.join(root, 'web', 'src', 'data', 'songs.generated.json');
const manifestFile = path.join(root, 'web', 'src', 'data', 'songCovers.generated.json');
const coverDirectory = path.join(root, 'web', 'public', 'song-covers');
const USER_AGENT = 'luo-yi-ba-cover-mirror/1.0 (VCPedia image cache)';
const REFERER = 'https://vcpedia.cn/';
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_INTERVAL_MS = 1000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function argumentNumber(name, fallback) {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`--${name} 必须是非负数字`);
  return number;
}

function coverFileName(song) {
  const hash = createHash('sha1').update(song.id).digest('hex').slice(0, 20);
  return `${hash}.webp`;
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  await execFileAsync(executable, ['-version'], { windowsHide: true, maxBuffer: 1024 * 1024 });
  return executable;
}
async function convertToWebp(ffmpeg, sourceFile, outputFile) {
  await execFileAsync(ffmpeg, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', sourceFile,
    '-vf', "scale=w='min(iw,640)':h=-2:force_original_aspect_ratio=decrease",
    '-c:v', 'libwebp',
    '-quality', '82',
    '-compression_level', '6',
    outputFile,
  ], { windowsHide: true, maxBuffer: 1024 * 1024 });
  const stat = await fs.stat(outputFile);
  if (!stat.size) throw new Error('ffmpeg 输出了空文件');
  return stat.size;
}

async function writeManifest(covers) {
  await fs.writeFile(manifestFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'local WebP mirror of songs.generated.json imageUrl',
    covers,
  }, null, 2)}\n`, 'utf8');
}

async function downloadSongCover(ffmpeg, song, temporaryDirectory) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const sourceFile = path.join(temporaryDirectory, `${coverFileName(song)}.source`);
    const outputFile = path.join(coverDirectory, coverFileName(song));
    try {
      const response = await fetch(song.imageUrl, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: REFERER,
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = Buffer.from(await response.arrayBuffer());
      if (!source.length) throw new Error('响应内容为空');
      await fs.writeFile(sourceFile, source);
      const bytes = await convertToWebp(ffmpeg, sourceFile, outputFile);
      return { localUrl: `/song-covers/${coverFileName(song)}`, bytes, sourceBytes: source.length };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function main() {
  const intervalMs = argumentNumber('interval', DEFAULT_INTERVAL_MS);
  const limit = argumentNumber('limit', Infinity);
  if (intervalMs < 500) throw new Error('--interval 不得小于 500ms');
  const songs = JSON.parse(await fs.readFile(songFile, 'utf8'));
  const existingData = JSON.parse(await fs.readFile(manifestFile, 'utf8').catch(() => '{"covers":{}}'));
  const covers = { ...(existingData.covers || {}) };
  const force = process.argv.includes('--force');
  const pending = songs.filter((song) => /^https?:\/\//iu.test(song.imageUrl || '')).slice(0, limit);
  const ffmpeg = await findFfmpeg();
  await fs.mkdir(coverDirectory, { recursive: true });
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'luo-yi-ba-covers-'));
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  try {
    for (const [index, song] of pending.entries()) {
      const fileName = coverFileName(song);
      const outputFile = path.join(coverDirectory, fileName);
      if (!force && covers[song.id]?.localUrl && await fs.access(outputFile).then(() => true).catch(() => false)) {
        skipped += 1;
        continue;
      }
      if (index > 0) await sleep(intervalMs);
      try {
        const result = await downloadSongCover(ffmpeg, song, temporaryDirectory);
        covers[song.id] = {
          title: song.title,
          sourceUrl: song.imageUrl,
          ...result,
          downloadedAt: new Date().toISOString(),
        };
        await writeManifest(covers);
        downloaded += 1;
        consecutiveFailures = 0;
        console.log(`已保存 ${downloaded} 张：${song.title}（${result.sourceBytes} → ${result.bytes} bytes）`);
      } catch (error) {
        failed += 1;
        consecutiveFailures += 1;
        console.error(`下载失败 ${song.title}：${error.message}（连续失败 ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}）`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error('连续多次下载失败，已停止后续爬取。');
          break;
        }
      }
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  await writeManifest(covers);
  console.log(JSON.stringify({ attempted: pending.length, downloaded, skipped, failed, totalLocalCovers: Object.keys(covers).length }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
