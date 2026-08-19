export default function ProducerModePage({ totalCount, famousCount, onChoose, onBack, Brand }) {
  return (
    <div className="page-shell producer-mode-page">
      <header className="simple-header"><Brand compact /><button type="button" className="back-button" onClick={onBack}>← 返回主页</button></header>
      <main className="producer-mode-main">
        <p className="eyebrow">闪耀的 Producer</p>
        <h2>选择挑战范围</h2>
        <p className="mode-intro">从初投稿、作品数量和代表曲的反馈中，找出隐藏的音乐创作者。</p>
        <div className="producer-mode-grid">
          <button type="button" className="producer-mode-card recommended" onClick={() => onChoose('famous')}>
            <span className="producer-mode-badge">推荐</span><strong>名 P 模式</strong><p>精选了更具代表性、曲目更加出圈的 P 主，强烈推荐游玩该模式。</p><small>{famousCount} 位候选 →</small>
          </button>
          <button type="button" className="producer-mode-card" onClick={() => onChoose('all')}>
            <strong>全 P 主模式</strong><p>收录表格中的全部创作者，更考验对不同年代与风格的了解。</p><small>{totalCount} 位候选 →</small>
          </button>
        </div>
      </main>
    </div>
  );
}
