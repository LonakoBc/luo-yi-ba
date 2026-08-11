const MODES = [
  {
    id: 'older',
    icon: '早',
    title: '谁是老资历？',
    description: '选择发布时间更早的歌曲，看看你对曲库历史有多熟悉。',
  },
  {
    id: 'newer',
    icon: '新',
    title: '谁是小资历？',
    description: '选择发布时间更新的歌曲，从最新鲜的曲目一路追溯。',
  },
];

export default function SeniorityModePage({ poolName, songCount, onChoose, onBack, Brand }) {
  return (
    <div className="page-shell seniority-page">
      <header className="inner-header seniority-header">
        <Brand compact />
        <button type="button" className="back-button" onClick={onBack}>← 选择曲库</button>
      </header>
      <main className="seniority-mode-main">
        <p className="eyebrow">发布时间挑战</p>
        <h2>这次要找更早，还是更新？</h2>
        <p className="mode-intro">{poolName} · {songCount} 首候选歌曲</p>
        <div className="seniority-mode-grid">
          {MODES.map((mode) => (
            <button type="button" key={mode.id} className={`seniority-mode-card ${mode.id}`} onClick={() => onChoose(mode.id)}>
              <span aria-hidden="true">{mode.icon}</span>
              <strong>{mode.title}</strong>
              <small>{mode.description}</small>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
