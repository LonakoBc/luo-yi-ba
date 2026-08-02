import { describe, expect, it } from 'vitest';
import songs from './songs.generated.json';
import { SIMPLE_SONG_TITLES, selectSimpleSongs } from './simpleSongTitles';

describe('简单模式曲库', () => {
  it('包含 50 首不重复且全部存在于数据库中的歌曲', () => {
    expect(SIMPLE_SONG_TITLES).toHaveLength(50);
    expect(new Set(SIMPLE_SONG_TITLES).size).toBe(50);
    expect(selectSimpleSongs(songs)).toHaveLength(50);
  });
});
