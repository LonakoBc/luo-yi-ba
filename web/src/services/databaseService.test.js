import { describe, expect, it } from 'vitest';
import { databaseOptions, filterDatabaseSongs, initialDatabaseFilters, sortDatabaseSongs } from './databaseService';

const songs = [
  { index: 1, title: '甲曲', staff: 'UP主：张三', lyrics: '蓝色旋律', releaseMonth: '2018-03', singers: '洛天依；言和', singerMembers: ['洛天依', '言和'], voicebanks: 'VOCALOID；ACE Studio', voicebankMembers: ['VOCALOID', 'ACE Studio'], concertCount: 2, special: '单曲' },
  { index: 2, title: '乙曲', staff: 'UP主：李四', lyrics: '星光落下', releaseMonth: '2020-01', singers: '洛天依', singerMembers: ['洛天依'], voicebanks: 'VOCALOID', voicebankMembers: ['VOCALOID'], concertCount: 5, special: '生贺曲' },
];

describe('数据库检索服务', () => {
  it('搜索曲名、STAFF 与歌词', () => {
    const base = initialDatabaseFilters(songs);
    expect(filterDatabaseSongs(songs, { ...base, query: '张三' })).toEqual([songs[0]]);
    expect(filterDatabaseSongs(songs, { ...base, query: '星光' })).toEqual([songs[1]]);
  });

  it('按拆分后的歌姬、声库、标注和年份筛选', () => {
    const base = initialDatabaseFilters(songs);
    expect(filterDatabaseSongs(songs, { ...base, singer: '言和' })).toEqual([songs[0]]);
    expect(filterDatabaseSongs(songs, { ...base, voicebank: 'ACE Studio' })).toEqual([songs[0]]);
    expect(filterDatabaseSongs(songs, { ...base, special: '生贺曲', startYear: '2019' })).toEqual([songs[1]]);
  });

  it('收集筛选项并支持列排序', () => {
    expect(databaseOptions(songs).voicebanks).toEqual(['ACE Studio', 'VOCALOID']);
    expect(sortDatabaseSongs(songs, { key: 'concertCount', direction: 'desc' }).map((song) => song.title)).toEqual(['乙曲', '甲曲']);
  });
});
