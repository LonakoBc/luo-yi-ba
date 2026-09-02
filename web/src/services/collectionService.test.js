import { describe, expect, it } from 'vitest';
import { buildCollectionProducerPool, buildCollectionSingerPool, buildCollectionSongPool, collectionShouldShowCover } from './collectionService';

describe('collectionService', () => {
  it('combines main songs with unmatched clip catalog entries', () => {
    const pool = buildCollectionSongPool(
      [{ id: 'song-1', title: '已有歌曲', imageUrl: 'cover.jpg' }],
      [
        { sourceKey: '已有歌曲', sourceName: '已有歌曲.mp3', fileName: 'one.mp3', playlistIds: ['a'] },
        { sourceKey: '新歌曲', sourceName: '新歌曲.mp3', fileName: 'two.mp3', playlistIds: ['a'] },
      ],
    );
    expect(pool).toHaveLength(2);
    expect(pool[0].id).toBe('song-1');
    expect(pool[1].title).toBe('新歌曲');
  });

  it('shows a cover only for one entry with a cover', () => {
    expect(collectionShouldShowCover([{ id: 'a', coverUrl: 'cover.jpg' }])).toBe(true);
    expect(collectionShouldShowCover([{ id: 'a', coverUrl: 'cover.jpg' }, { id: 'b', coverUrl: 'b.jpg' }])).toBe(false);
    expect(collectionShouldShowCover([{ id: 'a', coverUrl: '' }])).toBe(false);
  });

  it('将数据库 P 主与歌曲 STAFF 创作者合并，并保留数据库歌姬候选', () => {
    const producerPool = buildCollectionProducerPool(
      [{ id: 'database-p', name: '数据库P', aliases: [] }],
      [{ staffPeople: ['填词人', '数据库P', '作曲人'] }],
    );
    expect(producerPool.map((producer) => producer.name)).toEqual(['数据库P', '填词人', '作曲人']);
    expect(buildCollectionSingerPool([{ id: 'luotianyi', name: '洛天依' }])[0]).toMatchObject({ id: 'luotianyi', name: '洛天依' });
  });
});
