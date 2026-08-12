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
  { id: 'luotianyi', singer: '洛天依', count: 302 },
  { id: 'yuezhengling', singer: '乐正绫', count: 74 },
  { id: 'yanhe', singer: '言和', count: 70 },
  { id: 'zhiyu-moke', singer: '徵羽摩柯', count: 16 },
  { id: 'longya', singer: '乐正龙牙', count: 25 },
  { id: 'moqingxian', singer: '墨清弦', count: 14 },
  { id: 'xinhua', singer: '心华', count: 10 },
  { id: 'xingchen', singer: '星尘', count: 61 },
  { id: 'haiyi', singer: '海伊', count: 10 },
  { id: 'cangqiong', singer: '苍穹', count: 13 },
  { id: 'chiyu', singer: '赤羽', count: 24 },
  { id: 'shian', singer: '诗岸', count: 14 },
  { id: 'muxin', singer: '牧心', count: 3 },
  { id: 'minus', singer: '永夜Minus', aliases: ['Minus'], count: 7 },
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
      const acceptedSingers = new Set([library.singer, ...(library.aliases ?? [])]);
      assert.ok(fields.get('演唱歌姬').split('；').some((singer) => acceptedSingers.has(singer)), `${file} 不包含${library.singer}`);
      assert.match(fields.get('发布时间'), /^20\d{2}-(?:0[1-9]|1[0-2])$/u);
      assert.ok(Number.isInteger(Number(fields.get('演唱会\\生日会次数'))) && Number(fields.get('演唱会\\生日会次数')) >= 0);
      if (fields.get('哔哩哔哩地址')) assert.match(fields.get('哔哩哔哩地址'), /^https:\/\/(?:www\.)?bilibili\.com\/video\//u);
      assert.match(fields.get('歌曲页面URL'), /^https:\/\/vcpedia\.cn\//u);
      assert.ok(!titles.has(fields.get('曲名')), `重复曲名：${fields.get('曲名')}`);
      titles.add(fields.get('曲名'));
    }
  });
}

test('十四位歌姬共享歌曲按页面去重后为 495 首', async () => {
  const [luo, yue, yan, moke, longya, moqingxian, xinhua, xingchen, haiyi, cangqiong, chiyu, shian, muxin, minus] = await Promise.all([
    readFile(path.join(root, 'database', 'singers', 'luotianyi.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'yuezhengling.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'yanhe.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'zhiyu-moke.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'longya.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'moqingxian.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'xinhua.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'xingchen.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'haiyi.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'cangqiong.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'chiyu.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'shian.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'muxin.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'minus.json'), 'utf8').then(JSON.parse),
  ]);
  const canonical = (url) => decodeURIComponent(new URL(url).pathname).replace(/\/+$/u, '').normalize('NFKC');
  const luoByPage = new Map(luo.map((song) => [canonical(song.vcpediaUrl), song]));
  const sharedWithLuo = [...yue, ...yan, ...moke].filter((song) => luoByPage.has(canonical(song.vcpediaUrl)));
  assert.equal(yue.filter((song) => luoByPage.has(canonical(song.vcpediaUrl))).length, 36);
  assert.equal(yan.filter((song) => luoByPage.has(canonical(song.vcpediaUrl))).length, 47);
  assert.equal(moke.filter((song) => luoByPage.has(canonical(song.vcpediaUrl))).length, 6);
  const libraries = [luo, yue, yan, moke, longya, moqingxian, xinhua, xingchen, haiyi, cangqiong, chiyu, shian, muxin, minus];
  assert.equal(new Set(libraries.flat().map((song) => canonical(song.vcpediaUrl))).size, 495);
  assert.equal(libraries.flat().length, 643);
  for (const song of sharedWithLuo) {
    assert.deepEqual(song, luoByPage.get(canonical(song.vcpediaUrl)), song.title);
  }
  const yueByPage = new Map(yue.map((song) => [canonical(song.vcpediaUrl), song]));
  for (const song of yan.filter((item) => yueByPage.has(canonical(item.vcpediaUrl)))) {
    assert.deepEqual(song, yueByPage.get(canonical(song.vcpediaUrl)), song.title);
  }
});

test('赤羽《易安难安》歌词已人工补齐', async () => {
  const songs = JSON.parse(await readFile(path.join(root, 'database', 'singers', 'chiyu.json'), 'utf8'));
  assert.equal(songs.find(({ title }) => title === '易安难安')?.lyrics, '寻寻觅觅　冷冷清清　凄凄惨惨戚戚');
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

test('《哑巴》在洛天依与乐正龙牙曲库中保持一致', async () => {
  const [luotianyiSongs, longyaSongs] = await Promise.all([
    readFile(path.join(root, 'database', 'singers', 'luotianyi.json'), 'utf8').then(JSON.parse),
    readFile(path.join(root, 'database', 'singers', 'longya.json'), 'utf8').then(JSON.parse),
  ]);
  const luotianyiSong = luotianyiSongs.find(({ title }) => title === '哑巴');
  const longyaSong = longyaSongs.find(({ title }) => title === '哑巴');
  assert.ok(luotianyiSong);
  assert.deepEqual(longyaSong, luotianyiSong);
  assert.equal(luotianyiSong.releaseMonth, '2026-08');
  assert.equal(luotianyiSong.singers, '洛天依；乐正龙牙');
  assert.equal(luotianyiSong.voicebanks, 'ACE Studio');
  assert.equal(luotianyiSong.special, '系列/企划曲目');
});
