export default function ResultDialog({ answer, guessCount, outcome, onClose, onRestart }) {
  const won = outcome === 'won';
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="win-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
        <div className="celebration-mark" aria-hidden="true">♪</div>
        <p className="eyebrow">{won ? '回答正确' : '本局结束'}</p>
        <h2 id="result-title">{won ? '恭喜答对！' : '答案揭晓'}</h2>
        {!won && <p className="surrender-message">虽然没猜出来，但恭喜你发现了一首值得一听的歌曲！</p>}
        <p className="answer-name">《{answer.title}》</p>
        <p className="win-summary">本局一共猜了 <strong>{guessCount}</strong> 次。</p>
        <div className="dialog-actions">
          <a className="bilibili-link" href={answer.bilibiliUrl} target="_blank" rel="noreferrer noopener">前往 Bilibili 原视频 ↗</a>
          <button type="button" className="primary-button" onClick={onRestart}>再来一局</button>
          <button type="button" className="ghost-button" onClick={onClose}>查看结果</button>
        </div>
      </section>
    </div>
  );
}
