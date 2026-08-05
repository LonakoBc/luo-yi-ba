import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateDatabaseData, normalizeDatabaseSong } from './generate-database-data.mjs';

const tempDirectories = [];
afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const validSong = {
  title: '测试曲', staff: 'UP主：甲', releaseMonth: '2020-03', singers: '洛天依；言和',
  voicebanks: 'VOCALOID；ACE Studio', concertCount: 2, special: '单曲', lyrics: '完整的一句歌词',
  bilibiliUrl: 'https://www.bilibili.com/video/av123', vcpediaUrl: 'https://vcpedia.cn/测试曲',
};

describe('数据库数据生成', () => {
  it('拆分多歌姬和多声库并补充序号', () => {
    expect(normalizeDatabaseSong(validSong, 0, '洛天依')).toMatchObject({
      index: 1, singerMembers: ['洛天依', '言和'], voicebankMembers: ['VOCALOID', 'ACE Studio'],
    });
  });

  it('拒绝不包含目录歌姬和非法字段', () => {
    expect(() => normalizeDatabaseSong({ ...validSong, singers: '言和' }, 0, '洛天依')).toThrow('不包含洛天依');
    expect(() => normalizeDatabaseSong({ ...validSong, releaseMonth: '2020-13' }, 0, '洛天依')).toThrow('发布时间无效');
    expect(() => normalizeDatabaseSong({ ...validSong, concertCount: -1 }, 0, '洛天依')).toThrow('次数无效');
  });

  it('生成目录与歌姬曲库并校验声明数量', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'luoyiba-db-'));
    tempDirectories.push(root);
    await fs.mkdir(path.join(root, 'singers'));
    await fs.writeFile(path.join(root, 'singers', 'luotianyi.json'), JSON.stringify([validSong]), 'utf8');
    await fs.writeFile(path.join(root, 'catalog.json'), JSON.stringify([{ id: 'luotianyi', name: '洛天依', file: 'singers/luotianyi.json', expectedSongCount: 1 }]), 'utf8');
    const result = await generateDatabaseData({ catalogFile: path.join(root, 'catalog.json'), databaseRoot: root, outputFile: path.join(root, 'out.json') });
    expect(result.catalog).toEqual([{ id: 'luotianyi', name: '洛天依', songCount: 1 }]);
    expect(result.libraries.luotianyi).toHaveLength(1);
  });
});
