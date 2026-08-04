import { describe, expect, it } from 'vitest';
import presets from '../src/data/presets.generated.json';
import { parsePresetMarkdown } from './generate-preset-data.mjs';

describe('Markdown 曲库预设', () => {
  it('三个正式预设数量正确且没有重复曲名', () => {
    const counts = Object.fromEntries(presets.map((preset) => [preset.id, preset.titles.length]));
    expect(counts).toEqual({ 'golden-age': 93, intro: 50, luotianyi: 219 });
    for (const preset of presets) expect(new Set(preset.titles).size).toBe(preset.titles.length);
  });

  it('拒绝空预设和重复曲名', () => {
    expect(() => parsePresetMarkdown('# 空', 'empty')).toThrow('预设曲库为空');
    expect(() => parsePresetMarkdown('# 重复\n- A\n- A', 'duplicate')).toThrow('曲名重复');
  });
});
