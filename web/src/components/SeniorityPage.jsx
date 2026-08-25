import { useMemo, useState } from 'react';
import { createSeniorityService, seniorityEvaluation } from '../services/seniorityService';

function SongImage({ song }) {
  const [failed, setFailed] = useState(false);
  if (!song.imageUrl || failed) return <div className="seniority-image-placeholder" aria-label="歌曲图片暂无">♪</div>;
  return <img src={song.imageUrl} alt={`《${song.title}》歌曲图片`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function songCardTheme(songId) {
  let hash = 2166136261;
  for (const character of String(songId)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return {
    '--song-card-hue': hue,
    '--song-card-surface': `hsl(${hue} 78% 96%)`,
    '--song-card-surface-deep': `hsl(${hue} 72% 91%)`,
    '--song-card-accent': `hsl(${hue} 64% 57%)`,
    '--song-card-accent-soft': `hsl(${(hue + 28) % 360} 75% 72%)`,
    '--song-card-ink': `hsl(${hue} 48% 28%)`,
  };
}

function SongCard({ song, round, direction, revealed, releaseKnown, disabled, onChoose }) {
  const selected = round.selectedId === song.id;
  const correct = round.correctId === song.id;
  const resultClass = revealed ? correct ? 'is-correct' : selected ? 'is-wrong' : '' : '';
  const titleLength = [...song.title].length;
  const titleClass = titleLength >= 18 ? 'is-very-long-title' : titleLength >= 11 ? 'is-long-title' : '';
  return (
    <button
      type="button"
      className={`seniority-song-card ${resultClass}`}
      style={songCardTheme(song.id)}
      onClick={() => onChoose(song.id)}
      disabled={disabled}
      aria-label={`选择《${song.title}》作为${direction === 'newer' ? '更新' : '更早'}发布的歌曲`}
    >
      <span className="seniority-cover"><SongImage song={song} /></span>
      <span className="seniority-card-copy">
        <strong className={titleClass} title={`《${song.title}》`}><span>《{song.title}》</span></strong>
        <small>{song.staffDisplay}</small>
        <span className="seniority-card-meta">
          <span className="seniority-meta-singers" title="演唱歌姬">歌姬 · {song.singersDisplay}</span>
          <span title="特殊标注">标注 · {song.special}</span>
          <span title="演唱会/生日会次数">演出 · {song.concertCount} 次</span>
        </span>
        <span className={`seniority-date ${releaseKnown ? 'revealed' : ''}`}>
          发布时间：{releaseKnown ? song.releaseMonth : '????-??'}
        </span>
        {revealed && correct && <span className="seniority-result-label">✓ {direction === 'newer' ? '更新' : '更早'}发布</span>}
        {revealed && selected && !correct && <span className="seniority-result-label">× 选择错误</span>}
      </span>
    </button>
  );
}

function SettleConfirm({ onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="result-dialog seniority-confirm" role="dialog" aria-modal="true" aria-labelledby="settle-title">
        <p className="eyebrow">提前结束</p>
        <h2 id="settle-title">现在结算本局吗？</h2>
        <p>当前题目会记为未作答，分数和生命值不会改变。</p>
        <div className="result-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>继续游戏</button>
          <button type="button" className="surrender-button" onClick={onConfirm}>确认结算</button>
        </div>
      </section>
    </div>
  );
}

function SeniorityResultDialog({ game, direction, onRestart, onHome }) {
  const evaluation = seniorityEvaluation(game.score, direction);
  const correctCount = game.history.filter(({ outcome }) => outcome === 'correct').length;
  const wrongCount = game.history.filter(({ outcome }) => outcome === 'wrong').length;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="result-dialog seniority-result-dialog" role="dialog" aria-modal="true" aria-labelledby="seniority-result-title">
        <p className="eyebrow">{game.status === 'lost' ? '生命值耗尽' : game.status === 'completed' ? '曲库挑战完成' : '本局已结算'} · {direction === 'newer' ? '小资历' : '老资历'}</p>
        <h2 id="seniority-result-title">{evaluation.title}</h2>
        <p className="seniority-evaluation">{evaluation.description}</p>
        <div className="seniority-result-stats">
          <span><strong>{game.score}</strong>得分</span>
          <span><strong>{correctCount + wrongCount}</strong>完成轮数</span>
          <span><strong>{correctCount}</strong>正确</span>
          <span><strong>{wrongCount}</strong>错误</span>
        </div>
        <div className="seniority-history" aria-label="本局题目回顾">
          {game.history.map((round) => (
            <article key={round.number} className={`seniority-history-row ${round.outcome}`}>
              <strong>第 {round.number} 题</strong>
              <div><span>《{round.left.title}》</span><time>{round.left.releaseMonth}</time></div>
              <div><span>《{round.right.title}》</span><time>{round.right.releaseMonth}</time></div>
              <small>{round.outcome === 'correct' ? `✓ ${direction === 'newer' ? '更新' : '更早'}判断正确` : round.outcome === 'wrong' ? `× ${direction === 'newer' ? '更新' : '更早'}判断错误` : '— 未作答'}</small>
            </article>
          ))}
        </div>
        <div className="result-actions">
          <button type="button" className="primary-button" onClick={onRestart}>再来一盘</button>
          <button type="button" className="ghost-button" onClick={onHome}>返回主页</button>
        </div>
      </section>
    </div>
  );
}

export default function SeniorityPage({ songs, direction = 'older', random, onBack, Brand }) {
  const service = useMemo(() => createSeniorityService(songs, { random, direction }), [songs, random, direction]);
  const [game, setGame] = useState(() => service.startGame());
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);
  const finished = game.status === 'lost' || game.status === 'settled' || game.status === 'completed';
  const revealed = game.status === 'revealed' || game.status === 'lost' || game.status === 'completed';
  const revealedSongIds = new Set(game.revealedSongIds ?? []);

  const restart = () => {
    setGame(service.startGame());
    setShowSettleConfirm(false);
  };

  const settle = () => {
    setGame((current) => service.settle(current));
    setShowSettleConfirm(false);
  };

  return (
    <div className="page-shell seniority-page">
      <header className="inner-header seniority-header">
        <Brand compact />
        <button type="button" className="back-button" onClick={onBack}>← 选择曲库</button>
      </header>
      <main className="seniority-main">
        <div className="seniority-heading">
          <div><p className="eyebrow">发布时间挑战 · {direction === 'newer' ? '小资历' : '老资历'}</p><h2>{direction === 'newer' ? '谁是小资历？' : '谁是老资历？'}</h2><p>选出发布时间{direction === 'newer' ? '更新' : '更早'}的歌曲。</p></div>
          <div className="seniority-stats" aria-label="游戏状态">
            <span><strong aria-label={`${game.lives} 点生命`}>{'♥'.repeat(game.lives)}{'♡'.repeat(3 - game.lives)}</strong>生命</span>
            <span><strong>{game.score}</strong>得分</span>
            <span><strong>{game.round.number}</strong>轮次</span>
          </div>
        </div>

        <section className="seniority-board" aria-label={`第 ${game.round.number} 题`}>
          <SongCard key={game.round.left.id} song={game.round.left} round={game.round} direction={direction} revealed={revealed} releaseKnown={revealed || revealedSongIds.has(game.round.left.id)} disabled={game.status !== 'playing'} onChoose={(id) => setGame(service.choose(game, id))} />
          <div className="seniority-versus" aria-hidden="true">VS</div>
          <SongCard key={game.round.right.id} song={game.round.right} round={game.round} direction={direction} revealed={revealed} releaseKnown={revealed || revealedSongIds.has(game.round.right.id)} disabled={game.status !== 'playing'} onChoose={(id) => setGame(service.choose(game, id))} />
        </section>

        <div className="seniority-actions">
          {game.status === 'revealed' && <button type="button" className="primary-button" onClick={() => setGame(service.nextRound(game))}>下一题</button>}
          {!finished && <button type="button" className="ghost-button" onClick={() => setShowSettleConfirm(true)}>结算</button>}
        </div>
      </main>
      {showSettleConfirm && <SettleConfirm onCancel={() => setShowSettleConfirm(false)} onConfirm={settle} />}
      {finished && <SeniorityResultDialog game={game} direction={direction} onRestart={restart} onHome={onBack} />}
    </div>
  );
}
