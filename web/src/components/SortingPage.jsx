import { useMemo, useState } from 'react';
import { createSortingPuzzle, scoreTimeline, scoreYears, SORTING_MODES } from '../services/sortingService';

function moveItem(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ResultDialog({ puzzle, score, onClose, onReplay, onHome }) {
  const evaluation = score === puzzle.count ? '完美时间线！' : score >= Math.ceil(puzzle.count * 0.7) ? '年代感很敏锐！' : score >= Math.ceil(puzzle.count * 0.4) ? '已经抓住一些时代脉络' : '再听一轮就会更熟悉';
  return (
    <div className="modal-backdrop">
      <section className="result-dialog sorting-result-dialog" role="dialog" aria-modal="true" aria-labelledby="sorting-result-title">
        <div className="result-icon sorting-result-icon" aria-hidden="true">序</div>
        <p className="eyebrow">本轮得分</p>
        <h2 id="sorting-result-title">{score} / {puzzle.count}</h2>
        <p className="sorting-evaluation">{evaluation}</p>
        <ol className="sorting-answer-list" aria-label="正确发布时间顺序">
          {puzzle.answer.map((song) => <li key={song.id}><span>《{song.title}》</span><time>{song.releaseMonth}</time></li>)}
        </ol>
        <div className="result-actions sorting-result-actions">
          <button type="button" className="primary-action" onClick={onReplay}>再来一局</button>
          <button type="button" className="secondary-action" onClick={onClose}>查看答案</button>
          <button type="button" className="ghost-button" onClick={onHome}>选择曲库</button>
        </div>
      </section>
    </div>
  );
}

function TimelineBoard({ order, answer, revealed, onMove, onDrop }) {
  return (
    <ol className="sorting-timeline" aria-label="歌曲排序列表">
      {order.map((song, index) => {
        const correct = revealed && song.id === answer[index].id;
        return (
          <li
            key={song.id}
            className={revealed ? correct ? 'correct' : 'wrong' : ''}
            draggable={!revealed}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); onDrop(Number(event.dataTransfer.getData('text/plain')), index); }}
          >
            <span className="sorting-rank">{index + 1}</span>
            <span className="sorting-song-copy"><strong>《{song.title}》</strong><small>{song.staffDisplay}</small></span>
            {revealed && <time>{song.releaseMonth}</time>}
            {!revealed && <span className="sorting-move-actions"><button type="button" aria-label={`将《${song.title}》上移`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>↑</button><button type="button" aria-label={`将《${song.title}》下移`} disabled={index === order.length - 1} onClick={() => onMove(index, index + 1)}>↓</button></span>}
            {revealed && <span className="sorting-item-status">{correct ? '✓ 位置正确' : '× 位置不符'}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function YearBoard({ songs, years, assignments, answer, revealed, onAssign }) {
  return (
    <div className="sorting-year-grid" aria-label="歌曲年份归位列表">
      {songs.map((song) => {
        const actualYear = song.releaseMonth.slice(0, 4);
        const correct = revealed && assignments[song.id] === actualYear;
        return (
          <article key={song.id} className={revealed ? correct ? 'correct' : 'wrong' : ''}>
            <span className="sorting-song-copy"><strong>《{song.title}》</strong><small>{song.staffDisplay}</small></span>
            <label>
              <span>发布年份</span>
              <select aria-label={`选择《${song.title}》的发布年份`} value={assignments[song.id] ?? ''} disabled={revealed} onChange={(event) => onAssign(song.id, event.target.value)}>
                <option value="">请选择</option>
                {years.map((year) => <option value={year} key={year}>{year}</option>)}
              </select>
            </label>
            {revealed && <span className="sorting-year-answer">{correct ? '✓ 正确' : `× 正解 ${actualYear}`}</span>}
          </article>
        );
      })}
    </div>
  );
}

export default function SortingPage({ songs, random = Math.random, onBack, Brand }) {
  const [mode, setMode] = useState('timeline');
  const [count, setCount] = useState(5);
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const puzzle = useMemo(() => playing ? createSortingPuzzle(songs, { mode, count, random }) : null, [songs, mode, count, random, round, playing]);
  const [order, setOrder] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const begin = () => {
    setPlaying(true);
    setOrder([]);
    setRevealed(false);
    setAssignments({});
    setShowResult(false);
  };

  if (!playing) {
    return (
      <div className="page-shell sorting-page">
        <header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← 选择曲库</button><Brand compact /></header>
        <main className="sorting-setup-main">
          <p className="eyebrow">歌曲大排序</p><h2>把熟悉的歌放回时间线</h2><p>选择一种挑战方式和本局题量。</p>
          <div className="sorting-mode-grid">
            {Object.values(SORTING_MODES).map((item) => <button type="button" key={item.id} className={`sorting-mode-card ${mode === item.id ? 'selected' : ''}`} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><span>{item.id === 'timeline' ? '↕' : '年'}</span><strong>{item.name}</strong><small>{item.description}</small></button>)}
          </div>
          <fieldset className="sorting-count-picker"><legend>选择题量</legend>{[5, 10].map((value) => <button type="button" key={value} aria-pressed={count === value} disabled={songs.length < value} onClick={() => setCount(value)}>{value} 首</button>)}</fieldset>
          <button type="button" className="start-library-button sorting-start" onClick={begin}>开始排序 · {count} 首</button>
        </main>
      </div>
    );
  }

  const currentPuzzle = puzzle;
  const currentOrder = order.length ? order : currentPuzzle.initialOrder;
  const submit = () => {
    const nextScore = mode === 'timeline' ? scoreTimeline(currentOrder, currentPuzzle.answer) : scoreYears(assignments, currentPuzzle.answer);
    setScore(nextScore);
    setRevealed(true);
    setShowResult(true);
  };
  const incomplete = mode === 'years' && Object.keys(assignments).length < count;
  const replay = () => {
    setRound((value) => value + 1);
    setOrder([]);
    setAssignments({});
    setRevealed(false);
    setShowResult(false);
  };

  return (
    <div className="page-shell sorting-page">
      <header className="inner-header"><button type="button" className="back-button" onClick={() => setPlaying(false)}>← 模式选择</button><Brand compact /></header>
      <main className="sorting-game-main">
        <div className="sorting-game-heading"><div><p className="eyebrow">{SORTING_MODES[mode].name}</p><h2>歌曲大排序</h2></div><span>{count} 首挑战</span></div>
        <p className="sorting-instruction">{mode === 'timeline' ? '拖动歌曲，或用箭头将它们按发布时间从早到晚排列。' : '为每首歌曲选择正确的发布年份；本局年份互不重复。'}</p>
        {mode === 'timeline'
          ? <TimelineBoard order={currentOrder} answer={currentPuzzle.answer} revealed={revealed} onMove={(from, to) => setOrder(moveItem(currentOrder, from, to))} onDrop={(from, to) => setOrder(moveItem(currentOrder, from, to))} />
          : <YearBoard songs={currentPuzzle.initialOrder} years={currentPuzzle.years} assignments={assignments} answer={currentPuzzle.answer} revealed={revealed} onAssign={(id, year) => setAssignments((current) => {
            const next = { ...current };
            for (const [songId, assignedYear] of Object.entries(next)) if (songId !== id && assignedYear === year) delete next[songId];
            if (year) next[id] = year;
            else delete next[id];
            return next;
          })} />}
        <div className="sorting-game-actions">
          {!revealed && <button type="button" className="primary-action" disabled={incomplete} onClick={submit}>提交排序</button>}
          {revealed && <button type="button" className="primary-action" onClick={replay}>再来一局</button>}
          <button type="button" className="secondary-action" onClick={() => setPlaying(false)}>更换模式</button>
        </div>
      </main>
      {showResult && <ResultDialog puzzle={currentPuzzle} score={score} onClose={() => setShowResult(false)} onReplay={replay} onHome={onBack} />}
    </div>
  );
}
