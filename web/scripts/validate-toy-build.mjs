import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const outputRoot = path.resolve(webRoot, '../toy-dist');
const maximumBytes = 140 * 1024 * 1024;
const expectedMultiplayerApiUrl = process.env.VITE_TOY_MULTIPLAYER_API_URL ?? 'https://8.217.219.36';
const allowedExtensions = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.wasm', '.data', '.md', '.csv', '.tsv',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff2', '.woff', '.ttf', '.eot',
  '.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.webm', '.atlas', '.ani', '.part', '.nani', '.unityweb',
]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  }));
  return nested.flat();
}

const indexPath = path.join(outputRoot, 'index.html');
await stat(indexPath).catch(() => { throw new Error('Toy 构建缺少 toy-dist/index.html'); });
const files = await filesUnder(outputRoot);
const nestedFiles = files.filter((file) => path.dirname(path.relative(outputRoot, file)) !== '.');
if (nestedFiles.length) throw new Error(`Toy 构建仍包含子目录文件：${nestedFiles.map((file) => path.relative(outputRoot, file)).join(', ')}`);
const unsupported = files.filter((file) => !allowedExtensions.has(path.extname(file).toLowerCase()));
if (unsupported.length) throw new Error(`Toy 构建包含平台不支持的文件：${unsupported.map((file) => path.relative(outputRoot, file)).join(', ')}`);
const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
if (totalBytes > maximumBytes) throw new Error(`Toy 构建为 ${(totalBytes / 1024 / 1024).toFixed(2)}MB，超过 140MB 上限`);
const html = await readFile(indexPath, 'utf8');
if (!html.includes('toy-sdk.js')) throw new Error('Toy 构建未注入 Toy JS SDK');
if (/\b(?:src|href)="\/[^/"]/u.test(html)) throw new Error('Toy index.html 仍包含根路径静态资源');
const javascript = (await Promise.all(files
  .filter((file) => path.extname(file).toLowerCase() === '.js')
  .map((file) => readFile(file, 'utf8')))).join('\n');
if (!javascript.includes(expectedMultiplayerApiUrl)) throw new Error(`Toy build does not contain multiplayer API ${expectedMultiplayerApiUrl}`);
if (javascript.includes('luo-yi-ba-multiplayer.bocchi0708.workers.dev')) throw new Error('Toy build still contains the retired Cloudflare multiplayer API');
console.log(`Toy 构建校验通过：${files.length} 个文件，${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
