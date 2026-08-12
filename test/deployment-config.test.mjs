import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

test('Cloudflare Pages 地址与 SPA 路由配置保持有效', async () => {
  const readme = await fs.readFile('README.md', 'utf8');
  const redirects = await fs.readFile('web/public/_redirects', 'utf8');
  await assert.rejects(fs.access('netlify.toml'));
  assert.match(readme, /https:\/\/luo-yi-ba\.pages\.dev\//u);
  assert.doesNotMatch(readme, /https:\/\/luo-yi-ba\.netlify\.app\//u);
  assert.match(redirects, /\/index\.html\s+200/u);
});

test('多人联机 Worker 保持 Durable Object 部署配置', async () => {
  const config = JSON.parse(await fs.readFile('worker/wrangler.jsonc', 'utf8'));
  const exampleEnv = await fs.readFile('web/.env.example', 'utf8');
  assert.equal(config.main, 'src/index.js');
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'GUESS_ROOMS', class_name: 'GuessRoom' }]);
  assert.match(exampleEnv, /VITE_MULTIPLAYER_API_URL=/u);
});
