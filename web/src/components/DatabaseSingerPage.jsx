export default function DatabaseSingerPage({ catalog, onSelect, onBack, Brand }) {
  return (
    <div className="page-shell database-select-page">
      <header className="inner-header">
        <Brand compact />
        <button type="button" className="back-button" onClick={onBack}>← 返回主页</button>
      </header>
      <main className="database-select-main">
        <p className="eyebrow">歌曲数据库</p>
        <h2>选择曲库</h2>
        <p className="database-intro">浏览全曲库，或选择一位歌姬查看所有包含她的曲目资料。</p>
        <div className="singer-card-grid">
          {catalog.map((singer) => (
            <button key={singer.id} type="button" className={`singer-card ${singer.id === 'all' ? 'all-library-card' : ''}`} onClick={() => onSelect(singer.id)}>
              <span className="singer-avatar" style={{ '--singer-color': singer.themeColor }} aria-hidden="true">{singer.shortName}</span>
              <span className="singer-card-copy"><strong>{singer.name}</strong><small>当前收录 {singer.songCount} 首</small></span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
