function DatabaseCard({ item, onSelect, className = '' }) {
  return <button type="button" className={`singer-card ${className}`} onClick={() => onSelect(item.id)}>
    <span className="singer-avatar" style={{ '--singer-color': item.themeColor }} aria-hidden="true">{item.shortName}</span>
    <span className="singer-card-copy"><strong>{item.name}</strong><small>当前收录 {item.songCount} {item.unit ?? '首'}</small></span>
    <span className="card-arrow" aria-hidden="true">→</span>
  </button>;
}

export default function DatabaseSingerPage({ catalog, producerCount, onSelect, onBack, Brand }) {
  const allLibrary = catalog.find((item) => item.id === 'all');
  const singerCatalog = catalog.filter((item) => item.id !== 'all');
  const producerLibrary = { id: 'producers', name: 'P 主数据库', shortName: 'P', themeColor: '#00FFCC', songCount: producerCount, unit: '位' };
  return (
    <div className="page-shell database-select-page">
      <header className="inner-header">
        <Brand compact />
        <button type="button" className="back-button" onClick={onBack}>← 返回主页</button>
      </header>
      <main className="database-select-main">
        <p className="eyebrow">数据库</p>
        <h2>选择数据库</h2>
        <p className="database-intro">浏览全曲库、P 主资料，或选择一位歌姬查看所有包含她的曲目。</p>
        <div className="database-featured-grid">
          {allLibrary && <DatabaseCard item={allLibrary} onSelect={onSelect} className="all-library-card" />}
          <DatabaseCard item={producerLibrary} onSelect={onSelect} className="producer-library-card" />
        </div>
        <div className="singer-card-grid">
          {singerCatalog.map((singer) => <DatabaseCard key={singer.id} item={singer} onSelect={onSelect} />)}
        </div>
      </main>
    </div>
  );
}
