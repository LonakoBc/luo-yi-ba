export default function CrosswordLibraryPage({ presets, onBack, onStartPreset, Brand }) {
  return (
    <div className="page-shell library-page crossword-library-page">
      <header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← 返回主页</button><Brand compact /></header>
      <main className="library-main crossword-library-main">
        <p className="eyebrow">曲名填字</p>
        <h2>选择填字曲库</h2>
        <p className="mode-intro">从三个适合交叉填字的曲库范围中选择一项。</p>
        <section className="preset-section" aria-labelledby="crossword-preset-title">
          <div className="section-heading"><h3 id="crossword-preset-title">曲库预设</h3><span>点击后直接生成棋盘</span></div>
          <div className="preset-grid crossword-preset-grid">
            {presets.map((preset) => (
              <button type="button" className="preset-card" key={preset.id} onClick={() => onStartPreset(preset.id)}>
                <strong>{preset.id === 'all' ? '全曲库' : preset.name}</strong>
                <span>{preset.description}</span>
                <small>{preset.titles.length} 首 · 开始填字 →</small>
                {preset.badge && <span className="preset-singer-badge" style={{ '--preset-badge-color': preset.badge.color, '--preset-badge-text': preset.badge.textColor ?? '#FFFFFF' }} aria-hidden="true">{preset.badge.text}</span>}
              </button>
            ))}
          </div>
          <p className="crossword-library-note">仅纯汉字曲名会参与棋盘生成；每局仍随机抽取六首可以相互交叉的歌曲。</p>
        </section>
      </main>
    </div>
  );
}
