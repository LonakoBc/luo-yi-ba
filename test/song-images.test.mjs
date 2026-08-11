import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

test('歌曲图片清单覆盖全部 494 首全局曲目', async () => {
  const manifest = JSON.parse(await fs.readFile('database/song-images.json', 'utf8'));
  const entries = Object.entries(manifest.images);
  assert.equal(entries.length, 494);
  for (const [id, image] of entries) {
    assert.match(id, /^vcpedia:/u);
    assert.match(image.pageUrl, /^https:\/\/vcpedia\.cn\//u);
    if (image.thumbnailUrl) assert.match(image.thumbnailUrl, /^https:\/\/media\.vcpedia\.cn\//u);
  }
});
