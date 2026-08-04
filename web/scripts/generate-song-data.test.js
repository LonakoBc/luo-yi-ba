import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateSongData, parseSongMarkdown, parseStaffPeople } from './generate-song-data.mjs';

const tempDirectories = [];
afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const validMarkdown = (title = '测试歌曲') => `曲名：《${title}》
staff：UP主：甲；作曲：甲；作词：乙
发布时间：2020-03
演唱歌姬：洛天依
使用声库：VOCALOID
演唱会\\生日会次数：2
特殊标注：单曲
歌词：这是一句完整的测试歌词
哔哩哔哩地址：https://www.bilibili.com/video/av123
歌曲页面URL：https://vcpedia.cn/测试歌曲
`;

describe('歌曲 Markdown 解析', () => {
  it('生成规范化数据并保留展示文本', () => {
    const result = parseSongMarkdown(validMarkdown(), 'ce-shi');
    expect(result).toMatchObject({
      id: 'ce-shi', title: '测试歌曲', staffDisplay: 'UP主：甲；作曲：甲；作词：乙',
      staffPeople: ['甲', '乙'], releaseMonth: '2020-03', singersDisplay: '洛天依', singerMembers: ['洛天依'],
      voicebanksDisplay: 'VOCALOID', voicebankMembers: ['VOCALOID'], concertCount: 2, special: '单曲',
      vcpediaUrl: 'https://vcpedia.cn/测试歌曲',
    });
  });

  it('按职责项提取人员并保留名字自身括号', () => {
    expect(parseStaffPeople('作词：B（中文版）')).toEqual(['B（中文版）']);
  });

  it('支持职责前缀、多人和多声库', () => {
    expect(parseStaffPeople('UP主：甲、乙；作曲：甲')).toEqual(['甲', '乙', '甲']);
    expect(parseSongMarkdown(validMarkdown().replace('VOCALOID', 'VOCALOID；ACE Studio'), 'multi').voicebankMembers).toEqual(['VOCALOID', 'ACE Studio']);
  });

  it.each([
    ['字段缺失', validMarkdown().replace(/^歌词：.*\n/mu, ''), '缺少字段：歌词'],
    ['非法声库', validMarkdown().replace('VOCALOID', 'UTAU'), '使用声库无效'],
    ['非法时间', validMarkdown().replace('2020-03', '2020-13'), '发布时间无效'],
    ['非法次数', validMarkdown().replace('次数：2', '次数：-1'), '次数无效'],
    ['非法链接', validMarkdown().replace('https://www.bilibili.com/video/av123', 'https://example.com/a'), '必须是 HTTPS 视频页'],
    ['非法页面', validMarkdown().replace('https://vcpedia.cn/测试歌曲', 'https://example.com/a'), '必须是 VCPedia HTTPS 页面'],
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
