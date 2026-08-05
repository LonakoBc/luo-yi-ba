import { describe, expect, it } from 'vitest';
import database from '../src/data/database.generated.json';
import presets from '../src/data/presets.generated.json';
import songs from '../src/data/songs.generated.json';
import { parsePresetMarkdown } from './generate-preset-data.mjs';

describe('Markdown 曲库预设', () => {
  it('五个正式预设顺序与数量正确且没有重复曲名', () => {
    const counts = Object.fromEntries(presets.map((preset) => [preset.id, preset.titles.length]));
    expect(presets.map(({ id }) => id)).toEqual(['all', 'intro', 'luotianyi', 'yuezhengling', 'golden-age']);
    expect(counts).toEqual({ all: 239, intro: 50, luotianyi: 219, yuezhengling: 51, 'golden-age': 102 });
    expect(presets.find(({ id }) => id === 'intro').badge).toEqual({ text: '洛', color: '#66CCFF' });
    expect(presets.find(({ id }) => id === 'yuezhengling').badge).toEqual({ text: '绫', color: '#EE0000' });
    for (const preset of presets) expect(new Set(preset.titles).size).toBe(preset.titles.length);
  });

  it('拒绝空预设和重复曲名', () => {
    expect(() => parsePresetMarkdown('# 空', 'empty')).toThrow('预设曲库为空');
    expect(() => parsePresetMarkdown('# 重复\n- A\n- A', 'duplicate')).toThrow('曲名重复');
  });

  it('发布两个歌姬数据库并按 VCPedia 页面全局去重', () => {
    expect(songs).toHaveLength(239);
    expect(songs.filter(({ sourceLibraries }) => sourceLibraries.length === 2)).toHaveLength(31);
    expect(songs.filter(({ sourceLibraries }) => sourceLibraries.some(({ id }) => id === 'luotianyi'))).toHaveLength(219);
    expect(songs.filter(({ sourceLibraries }) => sourceLibraries.some(({ id }) => id === 'yuezhengling'))).toHaveLength(51);
    expect(database.catalog.map(({ id, songCount }) => [id, songCount])).toEqual([
      ['luotianyi', 219],
      ['yuezhengling', 51],
    ]);
    expect(database.catalog.find(({ id }) => id === 'luotianyi').shortName).toBe('依');
  });
});
