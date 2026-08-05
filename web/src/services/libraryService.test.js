import { describe, expect, it } from 'vitest';
import {
  createDefaultFilters,
  filterSongs,
  filtersFromSearch,
  filtersToSearch,
} from './libraryService';

const songs = [
  { title: '纯V', releaseMonth: '2012-07', singerMembers: ['洛天依'], voicebankMembers: ['VOCALOID'], concertCount: 0, special: '单曲', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
  { title: '混合', releaseMonth: '2019-12', singerMembers: ['洛天依', '言和'], voicebankMembers: ['VOCALOID', 'ACE Studio'], concertCount: 2, special: '系列/企划曲目', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }, { id: 'yanhe', name: '言和' }] },
  { title: 'ACE', releaseMonth: '2026-06', singerMembers: ['洛天依'], voicebankMembers: ['ACE Studio'], concertCount: 1, special: '生贺曲', sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }] },
];

describe('曲库筛选', () => {
  it('默认条件包含完整曲库并动态计算年份', () => {
    const filters = createDefaultFilters(songs);
    expect(filters).toMatchObject({ collections: ['luotianyi', 'yanhe'], singers: [], fromYear: 2012, toYear: 2026, concertOnly: false });
    expect(filterSongs(songs, filters)).toHaveLength(3);
  });

  it('主要曲库取并集，演唱歌姬作为额外的全部包含条件', () => {
    const defaults = createDefaultFilters(songs);
    expect(filterSongs(songs, { ...defaults, collections: ['yanhe'] }).map(({ title }) => title)).toEqual(['混合']);
    expect(filterSongs(songs, { ...defaults, singers: ['言和'] }).map(({ title }) => title)).toEqual(['混合']);
  });

  it('只选 VOCALOID 时排除混合声库，年份闭区间且支持演唱会筛选', () => {
    const filters = { ...createDefaultFilters(songs), voicebanks: ['VOCALOID'] };
    expect(filterSongs(songs, filters).map(({ title }) => title)).toEqual(['纯V']);
    const ranged = { ...createDefaultFilters(songs), fromYear: 2019, toYear: 2026, concertOnly: true };
    expect(filterSongs(songs, ranged).map(({ title }) => title)).toEqual(['混合', 'ACE']);
  });

  it('查询参数可以完整恢复筛选条件', () => {
    const filters = { ...createDefaultFilters(songs), voicebanks: ['VOCALOID'], specials: ['单曲'], fromYear: 2012, toYear: 2019, concertOnly: true };
    expect(filtersFromSearch(`?${filtersToSearch(filters)}`, songs)).toEqual(filters);
  });
});
