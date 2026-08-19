import { useMemo, useState } from 'react';

const SORT_LABELS = { name: 'P 主', debutDate: '初投稿时间', debutSong: '出道曲', hallCount: '殿堂及以上', legendCount: '传说', mythCount: '神话', famous: '名 P' };

function ProducerDetail({ producer, onClose }) {
  if (!producer) return null;
  return <div className="database-drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="database-drawer" role="dialog" aria-modal="true" aria-labelledby="producer-detail-title">
    <div className="drawer-heading"><div><p className="eyebrow">P 主详情</p><h2 id="producer-detail-title">{producer.name}</h2></div><button type="button" className="drawer-close" onClick={onClose} aria-label="关闭 P 主详情">×</button></div>
    <dl className="song-detail-list producer-detail-list">
      <div><dt>别名</dt><dd>{producer.aliases.length ? producer.aliases.join('、') : '无'}</dd></div><div><dt>初投稿时间</dt><dd>{producer.debutDate}</dd></div><div><dt>出道曲</dt><dd>《{producer.debutSong}》</dd></div>
      <div><dt>殿堂及以上</dt><dd>{producer.hallCount}</dd></div><div><dt>传说曲</dt><dd>{producer.legendCount}</dd></div><div><dt>神话曲</dt><dd>{producer.mythCount}</dd></div><div><dt>名 P</dt><dd>{producer.famous ? '是' : '否'}</dd></div>
      <div className="producer-representative-detail"><dt>代表曲</dt><dd>{producer.representativeSongs.map((song, index) => <span key={song}>{String.fromCharCode(65 + index)} · 《{song}》</span>)}</dd></div>
    </dl>
  </aside></div>;
}

export default function ProducerDatabasePage({ producers, onBack, onHome, Brand }) {
  const [query, setQuery] = useState(''); const [famousOnly, setFamousOnly] = useState(false); const [sort, setSort] = useState({ key: 'debutDate', direction: 'asc' }); const [selected, setSelected] = useState(null);
  const visible = useMemo(() => {
    const normalized = query.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\p{P}\p{S}\s]+/gu, '');
    const filtered = producers.filter((producer) => (!famousOnly || producer.famous) && (!normalized || [...producer.searchKeys, producer.debutSong, ...producer.representativeSongs].some((value) => String(value).normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\p{P}\p{S}\s]+/gu, '').includes(normalized))));
    return [...filtered].sort((a, b) => { const left = a[sort.key]; const right = b[sort.key]; const result = typeof left === 'number' || typeof left === 'boolean' ? Number(left) - Number(right) : String(left).localeCompare(String(right), 'zh-CN'); return sort.direction === 'asc' ? result : -result; });
  }, [producers, query, famousOnly, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  return <div className="page-shell database-page"><header className="inner-header database-header"><Brand compact /><div className="database-nav"><button type="button" className="back-button" onClick={onBack}>← 选择数据库</button><button type="button" className="back-button" onClick={onHome}>返回主页</button></div></header>
    <main className="database-main"><div className="database-title"><div><p className="eyebrow">数据库</p><h2>P 主数据库</h2></div><strong>{visible.length} / {producers.length} 位</strong></div>
      <section className="producer-database-filters" aria-label="P 主数据库搜索与筛选"><label><span>搜索名称、别名、出道曲或代表曲</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词…" /></label><label className="producer-famous-filter"><input type="checkbox" checked={famousOnly} onChange={(event) => setFamousOnly(event.target.checked)} />仅显示名 P</label><button type="button" className="database-reset" onClick={() => { setQuery(''); setFamousOnly(false); setSort({ key: 'debutDate', direction: 'asc' }); }}>清除筛选</button></section>
      <section className="database-table-panel" aria-label="P 主数据表">{visible.length ? <div className="database-table-scroll"><table className="database-table producer-database-table"><thead><tr>{Object.entries(SORT_LABELS).map(([key, label]) => <th key={key}><button type="button" className="database-sort" onClick={() => changeSort(key)}>{label}<span aria-hidden="true">{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span></button></th>)}<th>代表曲</th></tr></thead><tbody>{visible.map((producer) => <tr key={producer.id} tabIndex="0" onClick={() => setSelected(producer)} onKeyDown={(event) => event.key === 'Enter' && setSelected(producer)} aria-label={`查看 ${producer.name} 详情`}><td><strong>{producer.name}</strong></td><td>{producer.debutDate}</td><td>《{producer.debutSong}》</td><td>{producer.hallCount}</td><td>{producer.legendCount}</td><td>{producer.mythCount}</td><td>{producer.famous ? '是' : '否'}</td><td>{producer.representativeSongs.join('；')}</td></tr>)}</tbody></table></div> : <div className="database-empty"><strong>没有找到符合条件的 P 主</strong><span>试试更换关键词或清除筛选。</span></div>}</section>
    </main><ProducerDetail producer={selected} onClose={() => setSelected(null)} /></div>;
}
