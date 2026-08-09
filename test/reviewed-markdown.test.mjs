import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { slugifyTitle } from '../scripts/build-song-markdown.mjs';

const root = path.resolve(import.meta.dirname, '..');
function fieldsFromMarkdown(markdown) {
  return new Map(markdown.trimEnd().split(/\r?\n/u).map((line) => {
    const index = line.indexOf('：');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

for (const library of [
  { id: 'luotianyi', singer: '洛天依', count: 219 },
  { id: 'yuezhengling', singer: '乐正绫', count: 51 },
  { id: 'yanhe', singer: '言和', count: 51 },
  { id: 'zhiyu-moke', singer: '徵羽摩柯', count: 7 },
  { id: 'longya', singer: '乐正龙牙', count: 9 },
  { id: 'moqingxian', singer: '墨清弦', count: 2 },
]) {
  test(`${library.singer}审核后曲库包含 ${library.count} 个严格十行 Markdown 且 URL 合法`, async () => {
    const songDirectory = path.join(root, 'song', `song_${library.id}`);
    const files = (await readdir(songDirectory)).filter((file) => file.endsWith('.md'));
    assert.equal(files.length, library.count);
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
      assert.ok(fields.get('演唱歌姬').split('；').includes(library.singer), `${file} 不包含${library.singer}`);
      assert.match(fields.get('发布时间'), /^20\d{2}-(?:0[1-9]|1[0-2])$/u);
      assert.ok(Number.isInteger(Number(fields.get('演唱会\\生日会次数'))) && Number(fields.get('演唱会\\生日会次数')) >= 0);
      assert.match(fields.get('哔哩哔哩地址'), /^https:\/\/(?:www\.)?bilibili\.com\/video\//u);
      assert.match(fields.get('歌曲页面URL'), /^https:\/\/vcpedia\.cn\//u);
      assert.ok(!titles.has(fields.get('曲名')), `重复曲名：${fields.get('曲名')}`);
      titles.add(fields.get('曲名'));
    }
  });
}

test('六位歌姬共享歌曲按页面去重后为 251 首', async () => {
  const [luo, yue, yan, moke, longya, moqingxian] = await Promise.all([
    readFile(path.join(root, 'database', 'singers', 'luotianyi.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'yuezhengling.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'yanhe.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'zhiyu-moke.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'longya.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'moqingxian.json'), 'utf8').then(JSON.parse),
  ]);
  const canonical = (url) => decodeURIComponent(new URL(url).pathname).replace(/\/+$/u, '').normalize('NFKC');
  const luoByPage = new Map(luo.map((song) => [canonical(song.vcpediaUrl), song]));
  const sharedWithLuo = [...yue, ...yan, ...moke].filter((song) => luoByPage.has(canonical(song.vcpediaUrl)));
  assert.equal(yue.filter((song) => luoByPage.has(canonical(song.vcpediaUrl))).length, 31);
  assert.equal(yan.filter((song) => luoByPage.has(canonical(song.vcpediaUrl))).length, 43);
  assert.equal(moke.filter((song) => luoByPage.has(canonical(song.vcpediaUrl))).length, 3);
  assert.equal(new Set([...luo, ...yue, ...yan, ...moke, ...longya, ...moqingxian].map((song) => canonical(song.vcpediaUrl))).size, 251);
  for (const song of sharedWithLuo) {
    assert.deepEqual(song, luoByPage.get(canonical(song.vcpediaUrl)), song.title);
  }
  const yueByPage = new Map(yue.map((song) => [canonical(song.vcpediaUrl), song]));
  for (const song of yan.filter((item) => yueByPage.has(canonical(item.vcpediaUrl)))) {
    assert.deepEqual(song, yueByPage.get(canonical(song.vcpediaUrl)), song.title);
  }
});

test('乐正绫人工修订字段已同步到正式数据', async () => {
  const songs = JSON.parse(await readFile(path.join(root, 'database', 'singers', 'yuezhengling.json'), 'utf8'));
  const byTitle = new Map(songs.map((song) => [song.title, song]));
  assert.equal(byTitle.get('世末歌者').staff, 'UP主：COP');
  assert.equal(byTitle.get('世末歌者').singers, '乐正绫');
  assert.equal(byTitle.get('卷！').special, '系列/企划曲目');
  assert.equal(byTitle.get('跑！').special, '系列/企划曲目');
  assert.equal(byTitle.get('格兰芬多').special, '系列/企划曲目');
});

test('洛天依人工修订字段已同步到正式数据', async () => {
  const songs = JSON.parse(await readFile(path.join(root, 'database', 'singers', 'luotianyi.json'), 'utf8'));
  const byTitle = new Map(songs.map((song) => [song.title, song]));
  assert.equal(byTitle.get('唱山').special, '系列/企划曲目');
  assert.equal(byTitle.get('神经病之歌').special, '单曲');
});

test('多音字曲名使用人工确认的拼音', () => {
  assert.equal(slugifyTitle('乐鸣东方'), 'yue-ming-dong-fang');
});
