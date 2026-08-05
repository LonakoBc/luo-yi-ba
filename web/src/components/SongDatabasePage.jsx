import { useMemo, useState } from 'react';
import { databaseOptions, filterDatabaseSongs, initialDatabaseFilters, sortDatabaseSongs } from '../services/databaseService';

const COLUMNS = [
  ['index', '序号'], ['title', '曲名'], ['releaseMonth', '发布时间'], ['singers', '演唱歌姬'],
  ['voicebanks', '使用声库'], ['concertCount', '演唱会/生日会次数'], ['special', '特殊标注'],
];

function SortHeader({ column, label, sort, onSort }) {
  const active = sort.key === column;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="database-sort" onClick={() => onSort(column)}>
        {label}<span aria-hidden="true">{active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
      </button>
    </th>
  );
}

function SongDetail({ song, onClose }) {
  if (!song) return null;
  return (
    <div className="database-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="database-drawer" role="dialog" aria-modal="true" aria-labelledby="database-detail-title">
        <div className="drawer-heading">
          <div><p className="eyebrow">歌曲详情 · #{song.index}</p><h2 id="database-detail-title">《{song.title}》</h2></div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="关闭歌曲详情">×</button>
        </div>
        <dl className="song-detail-list">
          <div><dt>STAFF</dt><dd>{song.staff}</dd></div>
          <div><dt>发布时间</dt><dd>{song.releaseMonth}</dd></div>
          <div><dt>演唱歌姬</dt><dd>{song.singers}</dd></div>
          <div><dt>使用声库</dt><dd>{song.voicebanks}</dd></div>
          <div><dt>演唱会/生日会次数</dt><dd>{song.concertCount}</dd></div>
          <div><dt>特殊标注</dt><dd>{song.special}</dd></div>
          <div className="detail-lyrics"><dt>歌词</dt><dd>{song.lyrics}</dd></div>
        </dl>
        <div className="database-links">
          <a className="bilibili-link" href={song.bilibiliUrl} target="_blank" rel="noreferrer noopener">前往 Bilibili 原视频 ↗</a>
          <a className="vcpedia-link" href={song.vcpediaUrl} target="_blank" rel="noreferrer noopener">前往 VCPedia.cn 页面 ↗</a>
        </div>
      </aside>
    </div>
  );
}

export default function SongDatabasePage({ singer, songs, onBack, onHome, Brand }) {
  const options = useMemo(() => databaseOptions(songs), [songs]);
  const defaults = useMemo(() => initialDatabaseFilters(songs), [songs]);
  const [filters, setFilters] = useState(defaults);
  const [sort, setSort] = useState({ key: 'releaseMonth', direction: 'asc' });
  const [selectedSong, setSelectedSong] = useState(null);
  const visibleSongs = useMemo(
    () => sortDatabaseSongs(filterDatabaseSongs(songs, filters), sort),
    [songs, filters, sort],
  );

  const updateFilter = (field) => (event) => setFilters((current) => ({ ...current, [field]: event.target.value }));
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const reset = () => { setFilters(defaults); setSort({ key: 'releaseMonth', direction: 'asc' }); };

  return (
    <div className="page-shell database-page">
      <header className="inner-header database-header">
        <Brand compact />
        <div className="database-nav">
          <button type="button" className="back-button" onClick={onBack}>← 选择歌姬</button>
          <button type="button" className="back-button" onClick={onHome}>返回主页</button>
        </div>
      </header>
      <main className="database-main">
        <div className="database-title">
          <div><p className="eyebrow">歌曲数据库</p><h2>{singer.name}传说曲资料</h2></div>
          <strong>{visibleSongs.length} / {songs.length} 首</strong>
        </div>

        <section className="database-filter-panel" aria-label="数据库搜索与筛选">
          <label className="database-search"><span>搜索曲名、STAFF 或歌词</span><input type="search" value={filters.query} onChange={updateFilter('query')} placeholder="输入关键词…" /></label>
          <label><span>演唱歌姬</span><select value={filters.singer} onChange={updateFilter('singer')}><option value="">全部歌姬</option>{options.singers.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>使用声库</span><select value={filters.voicebank} onChange={updateFilter('voicebank')}><option value="">全部声库</option>{options.voicebanks.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>特殊标注</span><select value={filters.special} onChange={updateFilter('special')}><option value="">全部标注</option>{options.specials.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>最早年份</span><select value={filters.startYear} onChange={updateFilter('startYear')}>{options.years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>最晚年份</span><select value={filters.endYear} onChange={updateFilter('endYear')}>{options.years.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className="database-reset" onClick={reset}>清除筛选</button>
        </section>

        <section className="database-table-panel" aria-label={`${singer.name}歌曲数据表`}>
          {visibleSongs.length ? (
            <div className="database-table-scroll">
              <table className="database-table">
                <thead><tr>{COLUMNS.map(([column, label]) => <SortHeader key={column} column={column} label={label} sort={sort} onSort={changeSort} />)}</tr></thead>
                <tbody>
                  {visibleSongs.map((song) => (
                    <tr key={song.index} tabIndex="0" onClick={() => setSelectedSong(song)} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedSong(song); }} aria-label={`查看《${song.title}》详情`}>
                      <td>{song.index}</td><td><strong>《{song.title}》</strong></td><td>{song.releaseMonth}</td><td>{song.singers}</td>
                      <td>{song.voicebanks}</td><td>{song.concertCount}</td><td>{song.special}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="database-empty"><strong>没有找到符合条件的歌曲</strong><span>试试更换关键词或清除筛选。</span></div>}
        </section>
      </main>
      <SongDetail song={selectedSong} onClose={() => setSelectedSong(null)} />
    </div>
  );
}
