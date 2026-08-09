import { describe, expect, it } from 'vitest';
import database from '../src/data/database.generated.json';
import presets from '../src/data/presets.generated.json';
import songs from '../src/data/songs.generated.json';
import { parsePresetMarkdown } from './generate-preset-data.mjs';

describe('Markdown 曲库预设', () => {
  it('预设顺序、数量与曲名唯一性正确', () => {
    const counts = Object.fromEntries(presets.map((preset) => [preset.id, preset.titles.length]));
    expect(presets.map(({ id }) => id)).toEqual(['all', 'intro', 'luotianyi', 'yuezhengling', 'yanhe', 'henian', 'medium5', 'wangchuan', 'golden-age']);
    expect(counts).toEqual({ all: 355, intro: 50, luotianyi: 219, yuezhengling: 51, yanhe: 51, henian: 243, medium5: 95, wangchuan: 47, 'golden-age': 145 });
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
    expect(songs).toHaveLength(355);
    expect(database.catalog.map(({ id, songCount }) => [id, songCount])).toEqual([
      ['luotianyi', 219], ['yuezhengling', 51], ['yanhe', 51], ['zhiyu-moke', 7], ['longya', 9], ['moqingxian', 2], ['xinhua', 9], ['xingchen', 59],
      ['haiyi', 10], ['cangqiong', 13], ['chiyu', 24], ['shian', 14], ['muxin', 3], ['minus', 7],
    ]);
    expect(database.catalog.reduce((sum, singer) => sum + singer.songCount, 0)).toBe(478);
  });
});
