import { describe, expect, it } from 'vitest';
import database from '../src/data/database.generated.json';
import presets from '../src/data/presets.generated.json';
import songs from '../src/data/songs.generated.json';
import { parsePresetMarkdown } from './generate-preset-data.mjs';

describe('Markdown 曲库预设', () => {
  it('预设顺序、数量与曲名唯一性正确', () => {
    const counts = Object.fromEntries(presets.map((preset) => [preset.id, preset.titles.length]));
    expect(presets.map(({ id }) => id)).toEqual(['all', 'intro', 'luotianyi', 'yuezhengling', 'yanhe', 'golden-age']);
    expect(counts).toEqual({ all: 251, intro: 50, luotianyi: 219, yuezhengling: 51, yanhe: 51, 'golden-age': 110 });
    for (const preset of presets) expect(new Set(preset.titles).size).toBe(preset.titles.length);
  });

  it('拒绝空预设和重复曲名', () => {
    expect(() => parsePresetMarkdown('# 空', 'empty')).toThrow('预设曲库为空');
    expect(() => parsePresetMarkdown('# 重复\n- A\n- A', 'duplicate')).toThrow('曲名重复');
  });

  it('发布曲库按 VCPedia 页面全局去重，数据库包含数据库专用歌姬', () => {
    expect(songs).toHaveLength(251);
    expect(database.catalog.map(({ id, songCount }) => [id, songCount])).toEqual([
      ['luotianyi', 219], ['yuezhengling', 51], ['yanhe', 51], ['zhiyu-moke', 7], ['longya', 9], ['moqingxian', 2],
    ]);
    expect(database.catalog.reduce((sum, singer) => sum + singer.songCount, 0)).toBe(339);
  });
});
