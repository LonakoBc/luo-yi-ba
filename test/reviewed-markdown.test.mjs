import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { slugifyTitle } from '../scripts/build-song-markdown.mjs';

const root = path.resolve(import.meta.dirname, '..');
const songDirectory = path.join(root, 'song', 'song_luotianyi');

function fieldsFromMarkdown(markdown) {
  return new Map(markdown.trimEnd().split(/\r?\n/u).map((line) => {
    const index = line.indexOf('：');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

test('审核后曲库包含 219 个严格十行 Markdown 且 URL 合法', async () => {
  const files = (await readdir(songDirectory)).filter((file) => file.endsWith('.md'));
  assert.equal(files.length, 219);
  const titles = new Set();
  for (const file of files) {
    const markdown = await readFile(path.join(songDirectory, file), 'utf8');
    const lines = markdown.trimEnd().split(/\r?\n/u);
    assert.equal(lines.length, 10, file);
    const fields = fieldsFromMarkdown(markdown);
    assert.deepEqual([...fields.keys()], [
      '曲名', 'staff', '发布时间', '演唱歌姬', '使用声库', '演唱会\\生日会次数',
      '特殊标注', '歌词', '哔哩哔哩地址', '歌曲页面URL',
    ]);
    assert.match(fields.get('发布时间'), /^20\d{2}-(?:0[1-9]|1[0-2])$/u);
    assert.ok(Number.isInteger(Number(fields.get('演唱会\\生日会次数'))) && Number(fields.get('演唱会\\生日会次数')) >= 0);
    assert.match(fields.get('哔哩哔哩地址'), /^https:\/\/(?:www\.)?bilibili\.com\/video\//u);
    assert.match(fields.get('歌曲页面URL'), /^https:\/\/vcpedia\.cn\//u);
    assert.ok(!titles.has(fields.get('曲名')), `重复曲名：${fields.get('曲名')}`);
    titles.add(fields.get('曲名'));
  }
});

test('多音字曲名使用人工确认的拼音', () => {
  assert.equal(slugifyTitle('乐鸣东方'), 'yue-ming-dong-fang');
});
