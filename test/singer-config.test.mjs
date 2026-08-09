import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSingerCatalog, loadSingerConfig, singerIdFromArgs, singerPaths, singerYears } from '../scripts/singer-config.mjs';
import { usesAllowedVoicebanks } from '../scripts/crawl.mjs';

test('歌姬配置包含已发布曲库及待采集的言和', async () => {
  const catalog = await loadSingerCatalog();
  assert.deepEqual(catalog.allowedVoicebanks, ['VOCALOID', 'ACE Studio', 'X Studio', 'Synthesizer V']);
  const luotianyi = await loadSingerConfig('luotianyi');
  const yuezhengling = await loadSingerConfig('yuezhengling');
  const yanhe = await loadSingerConfig('yanhe');
  assert.equal(luotianyi.published, true);
  assert.equal(yuezhengling.published, true);
  assert.equal(yuezhengling.templatePrefix, 'Template:乐正绫');
  assert.equal(yuezhengling.birthday, '04-12');
  assert.deepEqual(singerYears(yuezhengling), [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.equal(yanhe.published, false);
  assert.equal(yanhe.profileUrl, 'https://vcpedia.cn/%E8%A8%80%E5%92%8C');
  assert.equal(yanhe.templatePrefix, 'Template:言和');
  assert.equal(yanhe.birthday, '07-11');
  assert.deepEqual(singerYears(yanhe), [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.notEqual(singerPaths(luotianyi).cacheDir, singerPaths(yuezhengling).cacheDir);
  assert.notEqual(singerPaths(yuezhengling).cacheDir, singerPaths(yanhe).cacheDir);
});

test('命令行歌姬参数支持分离与等号写法', () => {
  assert.equal(singerIdFromArgs(['--singer', 'yuezhengling']), 'yuezhengling');
  assert.equal(singerIdFromArgs(['--singer=yuezhengling']), 'yuezhengling');
  assert.equal(singerIdFromArgs(['--singer=yanhe']), 'yanhe');
  assert.equal(singerIdFromArgs([]), 'luotianyi');
});

test('只允许四种目标声库，混入其他引擎时排除', () => {
  const allowed = ['VOCALOID', 'ACE Studio', 'X Studio', 'Synthesizer V'];
  assert.equal(usesAllowedVoicebanks({ voicebanks: 'VOCALOID；ACE Studio' }, allowed), true);
  assert.equal(usesAllowedVoicebanks({ voicebanks: 'VOCALOID；UTAU' }, allowed), false);
  assert.equal(usesAllowedVoicebanks({ voicebanks: 'DiffSinger' }, allowed), false);
  assert.equal(usesAllowedVoicebanks({ voicebanks: '待核验' }, allowed), true);
});
