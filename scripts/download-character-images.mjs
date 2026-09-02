import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const singerCatalogFile = path.join(root, 'singers', 'catalog.json');
const producerFile = path.join(root, 'web', 'src', 'data', 'producers.generated.json');
const manifestFile = path.join(root, 'web', 'src', 'data', 'characterImages.generated.json');
const outputRoot = path.join(root, 'web', 'public', 'character-images');
const API_URL = 'https://vcpedia.cn/api.php';
const USER_AGENT = 'luo-yi-ba-character-image-mirror/1.0 (VCPedia image cache)';
const REFERER = 'https://vcpedia.cn/';
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_FAILURES = 3;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeTitle(value) {
  return String(value || '').replaceAll('_', ' ').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

function argumentNumber(name, fallback) {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1];
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`--${name} 必须是非负数字`);
  return number;
}

function assetFileName(character) {
  return `${createHash('sha1').update(`${character.kind}:${character.id}`).digest('hex').slice(0, 20)}.webp`;
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const executable = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  await execFileAsync(executable, ['-version'], { windowsHide: true, maxBuffer: 1024 * 1024 });
  return executable;
}

async function convertToWebp(ffmpeg, sourceFile, outputFile) {
  await execFileAsync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', sourceFile,
    '-vf', "scale=w='min(iw,640)':h=-2:force_original_aspect_ratio=decrease",
    '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', outputFile,
  ], { windowsHide: true, maxBuffer: 1024 * 1024 });
  const stat = await fs.stat(outputFile);
  if (!stat.size) throw new Error('ffmpeg 输出了空文件');
  return stat.size;
}

async function requestPageImages(titles) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'pageimages|info', inprop: 'url', piprop: 'thumbnail|original', pithumbsize: '800',
    titles: titles.join('|'),
  });
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await sleep(1000 * attempt);
    }
  }
  return null;
}

async function loadCharacters() {
  const singerCatalog = JSON.parse(await fs.readFile(singerCatalogFile, 'utf8'));
  const producers = JSON.parse(await fs.readFile(producerFile, 'utf8'));
  return [
    ...(singerCatalog.singers || []).filter((singer) => singer.published).map((singer) => ({
      kind: 'singer', id: singer.id, name: singer.name, aliases: singer.aliases || [], pageUrl: singer.profileUrl,
    })),
    ...producers.filter((producer) => producer.famous).map((producer) => ({
      kind: 'famous-producer', id: producer.id, name: producer.name, aliases: producer.aliases || [],
      pageUrl: `https://vcpedia.cn/${encodeURIComponent(producer.name)}`,
    })),
  ];
}

function pagesFromResponse(data) {
  const pages = new Map();
  for (const page of data?.query?.pages || []) {
    const source = page.thumbnail?.source || page.original?.source;
    if (source) pages.set(normalizeTitle(page.title), { sourceUrl: source, pageUrl: page.fullurl || null });
  }
  for (const redirect of data?.query?.redirects || []) {
    const target = pages.get(normalizeTitle(redirect.to));
    if (target) pages.set(normalizeTitle(redirect.from), target);
  }
  return pages;
}

async function writeManifest(characters) {
  await fs.writeFile(manifestFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'local WebP mirror of VCPedia pageimages',
    characters,
  }, null, 2)}\n`, 'utf8');
}

async function downloadCharacter(ffmpeg, character, image, temporaryDirectory) {
  let lastError;
  const sourceFile = path.join(temporaryDirectory, `${assetFileName(character)}.source`);
  const outputDirectory = path.join(outputRoot, character.kind === 'singer' ? 'singers' : 'famous-producers');
  const outputFile = path.join(outputDirectory, assetFileName(character));
  await fs.mkdir(outputDirectory, { recursive: true });
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(image.sourceUrl, {
        headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8', Referer: REFERER, 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = Buffer.from(await response.arrayBuffer());
      if (!source.length) throw new Error('响应内容为空');
      await fs.writeFile(sourceFile, source);
      const bytes = await convertToWebp(ffmpeg, sourceFile, outputFile);
      return { localUrl: `/character-images/${character.kind === 'singer' ? 'singers' : 'famous-producers'}/${assetFileName(character)}`, sourceUrl: image.sourceUrl, pageUrl: image.pageUrl || character.pageUrl, bytes, sourceBytes: source.length };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function main() {
  const intervalMs = argumentNumber('interval', 1000);
  if (intervalMs < 500) throw new Error('--interval 不得小于 500ms');
  const characters = await loadCharacters();
  const existing = JSON.parse(await fs.readFile(manifestFile, 'utf8').catch(() => '{"characters":{}}'));
  const assets = { ...(existing.characters || {}) };
  const force = process.argv.includes('--force');
  const ffmpeg = await findFfmpeg();
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'luo-yi-ba-character-images-'));
  const pageNames = [...new Set(characters.flatMap((character) => [character.name, ...(character.aliases || [])]))];
  const pages = new Map();
  try {
    for (let offset = 0; offset < pageNames.length; offset += 50) {
      const data = await requestPageImages(pageNames.slice(offset, offset + 50));
      for (const [key, value] of pagesFromResponse(data)) pages.set(key, value);
    }
    let downloaded = 0;
    let skipped = 0;
    let notFound = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    for (const [index, character] of characters.entries()) {
      const key = `${character.kind}:${character.id}`;
      const image = [character.name, ...(character.aliases || [])].map(normalizeTitle).map((name) => pages.get(name)).find(Boolean);
      const fileName = assetFileName(character);
      const outputFile = path.join(outputRoot, character.kind === 'singer' ? 'singers' : 'famous-producers', fileName);
      if (!force && assets[key]?.localUrl && await fs.access(outputFile).then(() => true).catch(() => false)) {
        skipped += 1;
        continue;
      }
      if (!image) {
        assets[key] = { title: character.name, pageUrl: character.pageUrl, localUrl: null, status: 'not-found' };
        notFound += 1;
        continue;
      }
      if (index > 0) await sleep(intervalMs);
      try {
        const result = await downloadCharacter(ffmpeg, character, image, temporaryDirectory);
        assets[key] = { title: character.name, ...result, downloadedAt: new Date().toISOString() };
        await writeManifest(assets);
        downloaded += 1;
        consecutiveFailures = 0;
        console.log(`已保存 ${character.kind === 'singer' ? '歌姬' : '名P'}：${character.name}（${result.sourceBytes} → ${result.bytes} bytes）`);
      } catch (error) {
        failed += 1;
        consecutiveFailures += 1;
        console.error(`下载失败 ${character.name}：${error.message}（连续失败 ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}）`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error('连续多次下载失败，已停止后续爬取。');
          break;
        }
      }
    }
    await writeManifest(assets);
    console.log(JSON.stringify({ attempted: characters.length, downloaded, skipped, notFound, failed, totalLocalImages: Object.values(assets).filter((asset) => asset.localUrl).length }, null, 2));
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
