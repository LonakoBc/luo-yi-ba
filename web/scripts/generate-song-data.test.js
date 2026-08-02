import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateSongData, parseSongMarkdown, parseStaffMembers } from './generate-song-data.mjs';

const tempDirectories = [];
afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const validMarkdown = (title = '测试歌曲') => `曲名：《${title}》
STAFF：甲（UP主、作曲）；乙（作词）
声库：VOCALOID
年份：2020
独唱或合唱：独唱
歌词：这是一句完整的测试歌词
特殊注明：无
哔哩哔哩地址：https://www.bilibili.com/video/av123
`;

describe('歌曲 Markdown 解析', () => {
  it('生成规范化数据并保留 STAFF 展示文本', () => {
    const result = parseSongMarkdown(validMarkdown(), 'ce-shi');
    expect(result).toMatchObject({
      id: 'ce-shi', title: '测试歌曲', staffDisplay: '甲（UP主、作曲）；乙（作词）',
      staffMembers: ['甲', '乙'], year: 2020, voicebank: 'VOCALOID', vocalType: '独唱', special: '无',
    });
  });

  it('保留名字自身括号，只移除末尾职责', () => {
    expect(parseStaffMembers('B（中文版）（作词）')).toEqual(['b中文版']);
  });

  it.each([
    ['字段缺失', validMarkdown().replace(/^歌词：.*\n/mu, ''), '缺少字段：歌词'],
    ['非法声库', validMarkdown().replace('VOCALOID', 'UTAU'), '声库无效'],
    ['非法链接', validMarkdown().replace('https://www.bilibili.com/video/av123', 'https://example.com/a'), '必须是 HTTPS 视频页'],
  ])('%s时拒绝生成', (_name, markdown, message) => {
    expect(() => parseSongMarkdown(markdown, 'bad.md')).toThrow(message);
  });

  it('拒绝重复曲名', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'luoyiba-'));
    tempDirectories.push(directory);
    const source = path.join(directory, 'songs');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'a.md'), validMarkdown('同名'), 'utf8');
    await fs.writeFile(path.join(source, 'b.md'), validMarkdown('同名'), 'utf8');
    await expect(generateSongData({ songDirectory: source, outputFile: path.join(directory, 'out.json') })).rejects.toThrow('曲名重复');
  });
});
