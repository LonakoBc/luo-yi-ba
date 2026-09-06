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

test('阿里云发布配置包含协议 v3、多玩法探针和完整打包脚本', async () => {
  const rules = await fs.readFile('web/src/services/multiplayerRules.js', 'utf8');
  const probe = await fs.readFile('server/scripts/check-room-flow.mjs', 'utf8');
  const packager = await fs.readFile('server/deploy/package.ps1', 'utf8');
  const service = await fs.readFile('server/deploy/luo-yi-ba-multiplayer.service', 'utf8');
  assert.match(rules, /MULTIPLAYER_PROTOCOL_VERSION = 3/u);
  for (const mode of ['guess-song', 'seniority', 'sorting', 'triathlon']) assert.match(probe, new RegExp(mode, 'u'));
  assert.match(packager, /server\/src/u);
  assert.match(packager, /multiplayerRules\.js/u);
  assert.match(service, /EnvironmentFile=-\/etc\/luo-yi-ba-multiplayer\.env/u);
  assert.match(await fs.readFile('server/deploy/feedback.env.example', 'utf8'), /FEEDBACK_ADMIN_PASSWORD=/u);
  assert.match(service, /FRONTEND_ORIGIN=https:\/\/luo-yi-ba\.pages\.dev/u);
  assert.match(service, /https:\/\/www\.bilibili\.com/u);
  assert.match(service, /https:\/\/www\.bilibilitoy\.com/u);
});

test('Bilibili Toy 构建使用 Hash 路由、相对资源和十二首专属 BGM', async () => {
  const packageJson = JSON.parse(await fs.readFile('web/package.json', 'utf8'));
  const config = await fs.readFile('web/vite.toy.config.js', 'utf8');
  const routing = await fs.readFile('web/src/services/appRouting.js', 'utf8');
  const catalog = await fs.readFile('web/src/services/bgmCatalog.toy.js', 'utf8');
  const validator = await fs.readFile('web/scripts/validate-toy-build.mjs', 'utf8');
  assert.match(packageJson.scripts['build:toy'], /vite\.toy\.config\.js/u);
  assert.match(config, /base:\s*'\.\/'/u);
  assert.match(config, /toy-sdk\.js/u);
  assert.match(config, /VITE_TOY_MULTIPLAYER_API_URL/u);
  assert.match(config, /https:\/\/8\.217\.219\.36/u);
  assert.match(config, /assetsDir:\s*''/u);
  assert.match(config, /assetFileNames:\s*'asset-\[hash\]\[extname\]'/u);
  assert.match(routing, /VITE_BUILD_TARGET === 'toy'/u);
  assert.match(routing, /`#\$\{normalized\}`/u);
  assert.deepEqual([...catalog.matchAll(/bgm\/(\d{2})-/gu)].map((match) => match[1]), ['06', '07', '08', '09', '10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
  assert.match(validator, /140 \* 1024 \* 1024/u);
  assert.match(validator, /retired Cloudflare multiplayer API/u);
});
