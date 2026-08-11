import { useMemo, useState } from 'react';
import { createSortingPuzzle, scoreTimeline, scoreYears, SORTING_MODES } from '../services/sortingService';

function moveItem(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function cardTheme(theme) {
  return {
    '--sorting-card-surface': theme?.surface,
    '--sorting-card-border': theme?.border,
    '--sorting-card-ink': theme?.ink,
  };
}

function ResultDialog({ puzzle, result, outcome, onClose, onReplay, onHome }) {
  const surrendered = outcome === 'surrendered';
  const score = puzzle.mode === 'timeline' ? result?.correctPairs : result?.correct;
  const maximum = puzzle.mode === 'timeline' ? result?.totalPairs : result?.total;
  const percentage = maximum ? Math.round((score / maximum) * 100) : 0;
  const evaluation = percentage === 100 ? '完美时间线！' : percentage >= 70 ? '年代感很敏锐！' : percentage >= 40 ? '已经抓住一些时代脉络' : '再听一轮就会更熟悉';
  return (
    <div className="modal-backdrop">
      <section className="result-dialog sorting-result-dialog" role="dialog" aria-modal="true" aria-labelledby="sorting-result-title">
        <div className="result-icon sorting-result-icon" aria-hidden="true">{surrendered ? '答' : '序'}</div>
        <p className="eyebrow">{surrendered ? '答案已揭晓' : '本轮得分'}</p>
        <h2 id="sorting-result-title">{surrendered ? '本局已投降' : `${score} / ${maximum}`}</h2>
        <p className="sorting-evaluation">{surrendered ? '不计分，完整时间线如下。' : puzzle.mode === 'timeline' ? `${evaluation} · 相对顺序正确率 ${percentage}%` : evaluation}</p>
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

function SurrenderConfirm({ onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="result-dialog sorting-surrender-dialog" role="dialog" aria-modal="true" aria-labelledby="sorting-surrender-title">
        <p className="eyebrow">确认投降</p>
        <h2 id="sorting-surrender-title">现在揭晓完整答案吗？</h2>
        <p>投降后本局不计分，当前排序或年份选择会被锁定。</p>
        <div className="result-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>继续游戏</button>
          <button type="button" className="surrender-button" onClick={onConfirm}>确认投降</button>
        </div>
      </section>
    </div>
  );
}

function TimelineBoard({ order, answer, themes, revealed, onMove, onDrop }) {
  const answerPositions = new Map(answer.map((song, index) => [song.id, index]));
  return (
    <ol className="sorting-timeline" aria-label="歌曲排序列表">
      {order.map((song, index) => {
        const correctIndex = answerPositions.get(song.id);
        const correct = revealed && correctIndex === index;
        const distance = Math.abs(correctIndex - index);
        return (
          <li
            key={song.id}
            className={revealed ? correct ? 'correct' : 'displaced' : ''}
            style={cardTheme(themes[song.id])}
            draggable={!revealed}
            onDragStart={(event) => event.dataTransfer.setData('application/x-sorting-index', String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); onDrop(Number(event.dataTransfer.getData('application/x-sorting-index')), index); }}
          >
            <span className="sorting-rank">{index + 1}</span>
            <span className="sorting-song-copy"><strong>《{song.title}》</strong><small>{song.staffDisplay}</small></span>
            {revealed && <time>{song.releaseMonth}</time>}
            {!revealed && <span className="sorting-move-actions"><button type="button" aria-label={`将《${song.title}》上移`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>↑</button><button type="button" aria-label={`将《${song.title}》下移`} disabled={index === order.length - 1} onClick={() => onMove(index, index + 1)}>↓</button></span>}
            {revealed && <span className="sorting-item-status">{correct ? '✓ 位置正确' : `正确第 ${correctIndex + 1} 位 · 相差 ${distance} 位`}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function YearBoard({ songs, years, themes, assignments, revealed, selectedYear, onSelectYear, onAssign }) {
  const usedYears = new Set(Object.values(assignments));
  const assignSelected = (songId) => {
    if (!revealed && selectedYear && !usedYears.has(selectedYear)) {
      onAssign(songId, selectedYear);
      onSelectYear(null);
    }
  };
  return (
    <>
      <div className="sorting-year-grid" aria-label="歌曲年份归位列表">
        {songs.map((song) => {
          const actualYear = song.releaseMonth.slice(0, 4);
          const currentYear = assignments[song.id] ?? '';
          const correct = revealed && currentYear === actualYear;
          const availableYears = years.filter((year) => !usedYears.has(year) || year === currentYear);
          return (
            <article
              key={song.id}
              className={`${revealed ? correct ? 'correct' : 'wrong' : ''} ${selectedYear && !revealed ? 'year-drop-ready' : ''}`}
              style={cardTheme(themes[song.id])}
              onDragOver={(event) => { if (!revealed) event.preventDefault(); }}
              onDrop={(event) => {
                event.preventDefault();
                const year = event.dataTransfer.getData('application/x-sorting-year');
                if (year && !usedYears.has(year)) onAssign(song.id, year);
              }}
              onClick={() => assignSelected(song.id)}
              onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && selectedYear) { event.preventDefault(); assignSelected(song.id); } }}
              tabIndex={selectedYear && !revealed ? 0 : undefined}
              aria-label={selectedYear && !revealed ? `将 ${selectedYear} 年分配给《${song.title}》` : undefined}
            >
              <span className="sorting-song-copy"><strong>《{song.title}》</strong><small>{song.staffDisplay}</small></span>
              <label onClick={(event) => event.stopPropagation()}>
                <span>发布年份</span>
                <select aria-label={`选择《${song.title}》的发布年份`} value={currentYear} disabled={revealed} onChange={(event) => onAssign(song.id, event.target.value)}>
                  <option value="">请选择</option>
                  {availableYears.map((year) => <option value={year} key={year}>{year}</option>)}
                </select>
              </label>
              {revealed && <span className="sorting-year-answer">{correct ? '✓ 正确' : `× 正解 ${actualYear}`}</span>}
            </article>
          );
        })}
      </div>
      {!revealed && (
        <section className="sorting-year-bank" aria-label="年份备选池">
          <div><strong>年份备选池</strong><small>拖到卡片，或先点年份再点歌曲</small></div>
          <div className="sorting-year-tokens">
            {years.map((year) => {
              const used = usedYears.has(year);
              return <button type="button" key={year} draggable={!used} disabled={used} aria-pressed={selectedYear === year} onDragStart={(event) => event.dataTransfer.setData('application/x-sorting-year', year)} onClick={() => onSelectYear(selectedYear === year ? null : year)}>{year}</button>;
            })}
          </div>
        </section>
      )}
    </>
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
  const [outcome, setOutcome] = useState('playing');
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [showSurrender, setShowSurrender] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);

  const resetRoundState = () => {
    setOrder([]);
    setAssignments({});
    setOutcome('playing');
    setResult(null);
    setShowResult(false);
    setShowSurrender(false);
    setSelectedYear(null);
  };
  const begin = () => {
    resetRoundState();
    setPlaying(true);
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

  const currentOrder = order.length ? order : puzzle.initialOrder;
  const revealed = outcome !== 'playing';
  const submit = () => {
    const nextResult = mode === 'timeline'
      ? scoreTimeline(currentOrder, puzzle.answer)
      : { correct: scoreYears(assignments, puzzle.answer), total: puzzle.count };
    setResult(nextResult);
    setOutcome('completed');
    setShowResult(true);
  };
  const incomplete = mode === 'years' && Object.keys(assignments).length < count;
  const replay = () => {
    setRound((value) => value + 1);
    resetRoundState();
  };
  const surrender = () => {
    setOutcome('surrendered');
    setResult(null);
    setShowSurrender(false);
    setShowResult(true);
    setSelectedYear(null);
  };
  const assignYear = (id, year) => setAssignments((current) => {
    if (year && Object.entries(current).some(([songId, assignedYear]) => songId !== id && assignedYear === year)) return current;
    const next = { ...current };
    if (year) next[id] = year;
    else delete next[id];
    return next;
  });

  return (
    <div className="page-shell sorting-page">
      <header className="inner-header"><button type="button" className="back-button" onClick={() => setPlaying(false)}>← 模式选择</button><Brand compact /></header>
      <main className="sorting-game-main">
        <div className="sorting-game-heading"><div><p className="eyebrow">{SORTING_MODES[mode].name}</p><h2>歌曲大排序</h2></div><span>{count} 首挑战</span></div>
        <p className="sorting-instruction">{mode === 'timeline' ? '拖动歌曲，或用箭头将它们按发布时间从早到晚排列；得分取决于两两歌曲的相对先后。' : '为每首歌曲选择正确的发布年份；本局年份互不重复。'}</p>
        {mode === 'timeline'
          ? <TimelineBoard order={currentOrder} answer={puzzle.answer} themes={puzzle.cardThemes} revealed={revealed} onMove={(from, to) => setOrder(moveItem(currentOrder, from, to))} onDrop={(from, to) => setOrder(moveItem(currentOrder, from, to))} />
          : <YearBoard songs={puzzle.initialOrder} years={puzzle.years} themes={puzzle.cardThemes} assignments={assignments} revealed={revealed} selectedYear={selectedYear} onSelectYear={setSelectedYear} onAssign={assignYear} />}
        <div className="sorting-game-actions">
          {!revealed && <button type="button" className="primary-action" disabled={incomplete} onClick={submit}>提交排序</button>}
          {!revealed && <button type="button" className="surrender-button" onClick={() => setShowSurrender(true)}>投降</button>}
          {revealed && <button type="button" className="primary-action" onClick={replay}>再来一局</button>}
          <button type="button" className="secondary-action" onClick={() => setPlaying(false)}>更换模式</button>
        </div>
      </main>
      {showSurrender && <SurrenderConfirm onCancel={() => setShowSurrender(false)} onConfirm={surrender} />}
      {showResult && <ResultDialog puzzle={puzzle} result={result} outcome={outcome} onClose={() => setShowResult(false)} onReplay={replay} onHome={onBack} />}
    </div>
  );
}
