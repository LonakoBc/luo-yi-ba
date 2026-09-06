import { describe, expect, it } from 'vitest';
import database from '../src/data/database.generated.json';
import presets from '../src/data/presets.generated.json';
import songs from '../src/data/songs.generated.json';
import { parsePresetMarkdown } from './generate-preset-data.mjs';

describe('Markdown 曲库预设', () => {
  it('日期修正及新增曲目的归属同步到发布数据', () => {
    const byTitle = new Map(songs.map((song) => [song.title, song]));
    expect(byTitle.get('权御天下').releaseMonth).toBe('2015-02');
    expect(byTitle.get('前尘如梦').releaseMonth).toBe('2012-10');
    expect(byTitle.get('草木青时')).toMatchObject({ releaseMonth: '2026-02', staffDisplay: 'UP主：库丘', voicebanksDisplay: 'ACE Studio', concertCount: 0, special: '单曲' });
    expect(byTitle.get('风起甘露')).toMatchObject({ releaseMonth: '2020-11', staffDisplay: 'UP主：忘川风华录', voicebanksDisplay: 'Synthesizer V', concertCount: 0, special: '系列/企划曲目' });
    const memberships = (title) => presets.filter(({ titles }) => titles.includes(title)).map(({ id }) => id);
    expect(memberships('草木青时')).toEqual(['all', 'luotianyi', 'henian']);
    expect(memberships('风起甘露')).toEqual(['all', 'medium5', 'wangchuan']);
    for (const title of ['权御天下', '前尘如梦', '草木青时', '风起甘露']) {
      expect(database.libraries.all.find((song) => song.title === title).releaseMonth).toBe(byTitle.get(title).releaseMonth);
    }
  });

  it('预设顺序、数量与曲名唯一性正确', () => {
    const counts = Object.fromEntries(presets.map((preset) => [preset.id, preset.titles.length]));
    expect(presets.map(({ id }) => id)).toEqual(['all', 'intro', 'luotianyi', 'yuezhengling', 'yanhe', 'henian', 'medium5', 'wangchuan', 'golden-age']);
    expect(counts).toEqual({ all: 521, intro: 50, luotianyi: 310, yuezhengling: 78, yanhe: 74, henian: 396, medium5: 102, wangchuan: 48, 'golden-age': 199 });
    expect(presets.every(({ badge }) => badge)).toBe(true);
    for (const preset of presets) expect(new Set(preset.titles).size).toBe(preset.titles.length);
  });

  it('拒绝空预设和重复曲名', () => {
    expect(() => parsePresetMarkdown('# 空', 'empty')).toThrow('预设曲库为空');
    expect(() => parsePresetMarkdown('# 重复\n- A\n- A', 'duplicate')).toThrow('曲名重复');
  });

  it('系统预设严格限制歌姬集合并精确匹配忘川风华录 UP 主', () => {
    const byId = new Map(songs.map((song) => [song.id, song]));
    const byPreset = new Map(presets.map((preset) => [preset.id, preset.songIds.map((id) => byId.get(id))]));
    const henian = new Set(['洛天依', '言和', '乐正绫', '乐正龙牙', '徵羽摩柯', '墨清弦']);
    const medium5 = new Set(['星尘', '海伊', '苍穹', '赤羽', '诗岸', '牧心', '永夜Minus']);
    expect(byPreset.get('henian').every((song) => song.singerMembers.every((name) => henian.has(name)))).toBe(true);
    expect(byPreset.get('medium5').every((song) => song.singerMembers.every((name) => medium5.has(name)))).toBe(true);
    expect(byPreset.get('wangchuan').every((song) => song.staffDisplay.split('；').some((entry) => entry === 'UP主：忘川风华录'))).toBe(true);
  });

  it('发布曲库按 VCPedia 页面全局去重，数据库包含数据库专用歌姬', () => {
    expect(songs).toHaveLength(521);
    expect(database.catalog.map(({ id, songCount }) => [id, songCount])).toEqual([
      ['all', 521],
      ['luotianyi', 310], ['yuezhengling', 78], ['yanhe', 74], ['zhiyu-moke', 20], ['longya', 30], ['moqingxian', 18], ['xinhua', 10], ['xingchen', 65],
      ['haiyi', 11], ['cangqiong', 14], ['chiyu', 24], ['shian', 18], ['muxin', 3], ['minus', 8],
    ]);
    expect(database.catalog.slice(1).reduce((sum, singer) => sum + singer.songCount, 0)).toBe(683);
    expect(database.libraries.all).toHaveLength(521);
    expect(new Set(database.libraries.all.map(({ vcpediaUrl }) => vcpediaUrl)).size).toBe(521);
  });
});
