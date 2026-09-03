import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTER_BANK_LIMIT, DIRECTIONS, createCharacterBank, entryCellKeys, generateCrossword } from '../services/crosswordService';

const keyFor = (row, column) => row + ',' + column;

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function CompletionDialog({ attempts, wrongAttempts, elapsed, onViewAnswers, onReplay, onBack, backLabel }) {
  return (
    <div className="modal-backdrop">
      <section className="result-dialog crossword-result" role="dialog" aria-modal="true" aria-labelledby="crossword-result-title">
        <div className="result-icon" aria-hidden="true">字</div>
        <p className="eyebrow">六首全部变绿</p>
        <h2 id="crossword-result-title">曲名填字完成！</h2>
        <p className="crossword-complete-copy">全部绿色，回答正确！</p>
        <div className="crossword-result-stats">
          <span><strong>{attempts}</strong><small>次自动验证</small></span>
          <span><strong>{wrongAttempts}</strong><small>次错误</small></span>
          <span><strong>{formatDuration(elapsed)}</strong><small>本局用时</small></span>
        </div>
        <div className="result-actions">
          <button type="button" className="primary-action" onClick={onViewAnswers}>查看答案</button>
          <button type="button" className="secondary-action" onClick={onReplay}>再来一局</button>
          <button type="button" className="secondary-action" onClick={onBack}>{backLabel}</button>
        </div>
      </section>
    </div>
  );
}

function AnswerPage({ entries, elapsed, onReplay, onResume, onBack, backLabel }) {
  return (
    <div className="modal-backdrop">
      <section className="result-dialog crossword-answer-page" role="dialog" aria-modal="true" aria-labelledby="crossword-answer-title">
        <div className="result-icon" aria-hidden="true">答</div>
        <p className="eyebrow">本局完整曲名</p>
        <h2 id="crossword-answer-title">曲名答案页</h2>
        <p className="crossword-answer-summary">用时 {formatDuration(elapsed)} · 共 {entries.length} 首歌曲</p>
        <div className="crossword-answer-list">
          {entries.map((entry) => (
            <article key={entry.id} className="crossword-answer-item">
              <span className="clue-number">{entry.number}</span>
              <span className="crossword-answer-direction">{DIRECTIONS[entry.direction].label}向 · {entry.characters.length} 字</span>
              <div>
                <strong>《{entry.song.title}》</strong>
                <small>{entry.song.releaseMonth || '发行时间未知'} · {entry.song.staffDisplay || '洛天依曲库'}</small>
              </div>
            </article>
          ))}
        </div>
        <div className="result-actions">
          <button type="button" className="primary-action" onClick={onReplay}>快速开始下一把</button>
          <button type="button" className="secondary-action" onClick={onResume}>返回棋盘</button>
          <button type="button" className="secondary-action" onClick={onBack}>{backLabel}</button>
        </div>
      </section>
    </div>
  );
}

function SurrenderDialog({ onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="result-dialog surrender-dialog" role="dialog" aria-modal="true" aria-labelledby="crossword-surrender-title">
        <div className="result-icon surrender-icon" aria-hidden="true">?</div>
        <p className="eyebrow">确认投降</p>
        <h2 id="crossword-surrender-title">要揭晓全部曲名吗？</h2>
        <p>确认后将停止计时并填入整张棋盘，本局不能继续作答。</p>
        <div className="result-actions">
          <button type="button" className="secondary-action" onClick={onCancel}>继续游戏</button>
          <button type="button" className="danger-action" onClick={onConfirm}>确认投降</button>
        </div>
      </section>
    </div>
  );
}

export default function CrosswordPage({ songs, random = Math.random, onBack, Brand, backLabel = '返回主页' }) {
  const [round, setRound] = useState(0);
  const generated = useMemo(() => {
    try {
      return { puzzle: generateCrossword(songs, { random }), error: '' };
    } catch (error) {
      return { puzzle: null, error: error.message };
    }
  }, [songs, random, round]);
  const { puzzle, error } = generated;
  const cellsByKey = useMemo(() => new Map((puzzle ? puzzle.cells : []).map((cell) => [keyFor(cell.row, cell.column), cell])), [puzzle]);
  const entriesById = useMemo(() => new Map((puzzle ? puzzle.entries : []).map((entry) => [entry.id, entry])), [puzzle]);
  const characterBank = useMemo(() => puzzle ? createCharacterBank(puzzle, { random }) : [], [puzzle, random]);
  const [tileAssignments, setTileAssignments] = useState({});
  const [statuses, setStatuses] = useState({});
  const [entryErrors, setEntryErrors] = useState({});
  const [selectedEntryId, setSelectedEntryId] = useState(puzzle ? puzzle.entries[0]?.id : null);
  const [selectedCellKey, setSelectedCellKey] = useState(null);
  const [openLyrics, setOpenLyrics] = useState(new Set());
  const [notice, setNotice] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [surrenderDialogOpen, setSurrenderDialogOpen] = useState(false);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [surrendered, setSurrendered] = useState(false);
  const [characterSearch, setCharacterSearch] = useState('');
  const [dragOverCellKey, setDragOverCellKey] = useState(null);
  const startedAt = useRef(Date.now());

  const values = useMemo(() => {
    const next = Object.fromEntries((puzzle ? puzzle.cells : []).filter(({ isFixed }) => isFixed).map((cell) => [keyFor(cell.row, cell.column), cell.character]));
    if (surrendered) return Object.fromEntries((puzzle ? puzzle.cells : []).map((cell) => [keyFor(cell.row, cell.column), cell.character]));
    Object.entries(tileAssignments).forEach(([key, tileId]) => {
      const tile = characterBank.find(({ id }) => id === tileId);
      if (tile) next[key] = tile.character;
    });
    return next;
  }, [characterBank, puzzle, surrendered, tileAssignments]);

  const solvedCount = puzzle ? puzzle.entries.filter(({ id }) => statuses[id] === 'solved').length : 0;
  const completed = Boolean(puzzle && solvedCount === puzzle.entries.length);
  const selectedEntry = entriesById.get(selectedEntryId) || (puzzle ? puzzle.entries[0] : null);
  const usedTileIds = new Set(Object.values(tileAssignments));
  const visibleCharacterBank = characterBank.filter((tile) => !characterSearch || tile.character.includes(characterSearch.trim()));

  useEffect(() => {
    if (completed && !surrendered && !completionDialogOpen && !showAnswers) {
      setNotice('全部绿色，回答正确！');
      setCompletionDialogOpen(true);
    }
  }, [completed, completionDialogOpen, showAnswers, surrendered]);

  useEffect(() => {
    if (completed || surrendered || !puzzle) return undefined;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [completed, puzzle, surrendered]);

  useEffect(() => {
    if (!puzzle) return;
    const firstEmpty = puzzle.cells.find((cell) => !cell.isFixed);
    setTileAssignments({});
    setStatuses({});
    setEntryErrors({});
    setSelectedEntryId(puzzle.entries[0]?.id || null);
    setSelectedCellKey(firstEmpty ? keyFor(firstEmpty.row, firstEmpty.column) : null);
  }, [puzzle]);

  const resetRound = () => {
    startedAt.current = Date.now();
    setElapsed(0);
    setTileAssignments({});
    setStatuses({});
    setEntryErrors({});
    setOpenLyrics(new Set());
    setNotice('');
    setAttempts(0);
    setWrongAttempts(0);
    setSurrenderDialogOpen(false);
    setCompletionDialogOpen(false);
    setShowAnswers(false);
    setSurrendered(false);
    setCharacterSearch('');
    setDragOverCellKey(null);
    setSelectedEntryId(null);
    setSelectedCellKey(null);
    setRound((current) => current + 1);
  };

  const resetProgress = () => {
    const firstEmpty = puzzle.cells.find((cell) => !cell.isFixed);
    startedAt.current = Date.now();
    setElapsed(0);
    setTileAssignments({});
    setStatuses({});
    setEntryErrors({});
    setOpenLyrics(new Set());
    setNotice('已重置本局全部填写');
    setAttempts(0);
    setWrongAttempts(0);
    setSurrenderDialogOpen(false);
    setCompletionDialogOpen(false);
    setShowAnswers(false);
    setSurrendered(false);
    setCharacterSearch('');
    setDragOverCellKey(null);
    setSelectedEntryId(puzzle.entries[0]?.id || null);
    setSelectedCellKey(firstEmpty ? keyFor(firstEmpty.row, firstEmpty.column) : null);
  };

  if (!puzzle) {
    return (
      <div className="page-shell crossword-page">
        <header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← {backLabel}</button><Brand compact /></header>
        <main className="crossword-error" role="alert">
          <p className="eyebrow">曲名填字</p><h2>本局生成失败</h2><p>{error}</p>
          <button type="button" className="primary-action" onClick={resetRound}>重新生成</button>
        </main>
      </div>
    );
  }

  const editableKeysFor = (entry) => entryCellKeys(entry).filter((key) => {
    const cell = cellsByKey.get(key);
    return !surrendered && !cell.isFixed && !cell.entryIds.some((id) => statuses[id] === 'solved') && statuses[entry.id] !== 'solved';
  });

  const selectNextEmpty = (entryId, assignments) => {
    const entry = entriesById.get(entryId);
    const candidate = entry && editableKeysFor(entry).find((key) => !assignments[key]);
    if (candidate) return candidate;
    const fallback = puzzle.entries.find((candidateEntry) => statuses[candidateEntry.id] !== 'solved' && editableKeysFor(candidateEntry).some((key) => !assignments[key]));
    return fallback ? editableKeysFor(fallback).find((key) => !assignments[key]) : null;
  };

  const selectCellEntry = (cell) => {
    const currentIndex = cell.entryIds.indexOf(selectedEntryId);
    const nextEntryId = cell.entryIds.length === 1 ? cell.entryIds[0] : cell.entryIds[(currentIndex + 1) % cell.entryIds.length];
    setSelectedEntryId(nextEntryId);
    setSelectedCellKey(keyFor(cell.row, cell.column));
  };

  const evaluateAssignments = (nextAssignments) => {
    const nextValues = Object.fromEntries(puzzle.cells.filter(({ isFixed }) => isFixed).map((cell) => [keyFor(cell.row, cell.column), cell.character]));
    Object.entries(nextAssignments).forEach(([key, tileId]) => {
      const tile = characterBank.find(({ id }) => id === tileId);
      if (tile) nextValues[key] = tile.character;
    });
    const nextStatuses = { ...statuses };
    const nextErrors = { ...entryErrors };
    const fullIds = [];
    const newlySolvedIds = [];
    const newlyWrongIds = [];
    puzzle.entries.forEach((entry) => {
      if (statuses[entry.id] === 'solved') return;
      const keys = entryCellKeys(entry);
      const full = keys.every((key) => nextValues[key]);
      if (!full) {
        nextStatuses[entry.id] = 'pending';
        nextErrors[entry.id] = [];
        return;
      }
      fullIds.push(entry.id);
      const incorrectKeys = keys.filter((key, index) => nextValues[key] !== entry.characters[index]);
      if (incorrectKeys.length) {
        nextStatuses[entry.id] = 'wrong';
        nextErrors[entry.id] = incorrectKeys;
        newlyWrongIds.push(entry.id);
      } else {
        nextStatuses[entry.id] = 'solved';
        nextErrors[entry.id] = [];
        newlySolvedIds.push(entry.id);
      }
    });
    return { nextStatuses, nextErrors, fullIds, newlySolvedIds, newlyWrongIds };
  };

  const placeTile = (tile, preferredKey = null, entryIdOverride = null) => {
    if (surrendered || showAnswers || usedTileIds.has(tile.id)) return;
    const targetEntry = entriesById.get(entryIdOverride || selectedEntryId) || puzzle.entries.find((entry) => statuses[entry.id] !== 'solved');
    const targetKey = preferredKey && targetEntry && editableKeysFor(targetEntry).includes(preferredKey) && !tileAssignments[preferredKey]
      ? preferredKey
      : selectedCellKey && targetEntry && editableKeysFor(targetEntry).includes(selectedCellKey) && !tileAssignments[selectedCellKey]
      ? selectedCellKey
      : selectNextEmpty(targetEntry?.id, tileAssignments);
    if (!targetKey) {
      setNotice('请先选择一条还未完成的曲名');
      return;
    }
    const nextAssignments = { ...tileAssignments, [targetKey]: tile.id };
    const previousFullIds = new Set(puzzle.entries.filter((entry) => entryCellKeys(entry).every((key) => values[key])).map((entry) => entry.id));
    const result = evaluateAssignments(nextAssignments);
    const newlyFullIds = result.fullIds.filter((id) => !previousFullIds.has(id));
    setTileAssignments(nextAssignments);
    setStatuses(result.nextStatuses);
    setEntryErrors(result.nextErrors);
    setSelectedCellKey(selectNextEmpty(targetEntry?.id, nextAssignments));
    if (newlyFullIds.length) {
      setAttempts((current) => current + newlyFullIds.length);
      const wrongIds = newlyFullIds.filter((id) => result.newlyWrongIds.includes(id));
      if (wrongIds.length) {
        setWrongAttempts((current) => current + wrongIds.length);
        setNotice(wrongIds.map((id) => entriesById.get(id).number).join('、') + ' 号曲名自动验证未通过，边缘已标红');
      } else if (result.newlySolvedIds.some((id) => newlyFullIds.includes(id))) {
        setNotice(newlyFullIds.map((id) => entriesById.get(id).number).join('、') + ' 号曲名正确，边缘已变绿');
      }
    }
  };

  const handleDragStart = (event, tile) => {
    if (usedTileIds.has(tile.id) || surrendered || showAnswers) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tile.id);
  };

  const canDropOnCell = (cell) => {
    const key = keyFor(cell.row, cell.column);
    return !surrendered && !showAnswers && !cell.isFixed && !tileAssignments[key] && !cell.entryIds.some((id) => statuses[id] === 'solved');
  };

  const handleDrop = (event, cell) => {
    event.preventDefault();
    setDragOverCellKey(null);
    const tile = characterBank.find(({ id }) => id === event.dataTransfer.getData('text/plain'));
    if (!tile || !canDropOnCell(cell)) return;
    const key = keyFor(cell.row, cell.column);
    const entryId = cell.entryIds.find((id) => statuses[id] !== 'solved') || cell.entryIds[0];
    setSelectedEntryId(entryId);
    setSelectedCellKey(key);
    placeTile(tile, key, entryId);
  };

  const removeTile = (cell) => {
    if (surrendered || showAnswers || cell.isFixed || cell.entryIds.some((id) => statuses[id] === 'solved')) {
      selectCellEntry(cell);
      return;
    }
    const key = keyFor(cell.row, cell.column);
    if (!tileAssignments[key]) {
      selectCellEntry(cell);
      return;
    }
    const nextAssignments = { ...tileAssignments };
    delete nextAssignments[key];
    const result = evaluateAssignments(nextAssignments);
    setTileAssignments(nextAssignments);
    setStatuses(result.nextStatuses);
    setEntryErrors(result.nextErrors);
    setSelectedEntryId(cell.entryIds[0]);
    setSelectedCellKey(key);
    setNotice('字块已退回池中，可重新选择');
  };

  const confirmSurrender = () => {
    setTileAssignments({});
    setEntryErrors({});
    setSurrenderDialogOpen(false);
    setCompletionDialogOpen(false);
    setSurrendered(true);
    setShowAnswers(true);
    setNotice('答案已揭晓，可以查看六首完整曲名');
  };

  return (
    <div className="page-shell crossword-page">
      <header className="inner-header crossword-header">
        <button type="button" className="back-button" onClick={onBack}>← {backLabel}</button>
        <Brand compact />
        <div className="crossword-summary" aria-label="游戏状态">
          <span><strong>{surrendered ? '答案' : solvedCount + '/' + puzzle.entries.length}</strong> {surrendered ? '已揭晓' : '已完成'}</span>
          <span><strong>{attempts}</strong> 次自动验证</span>
          <span><strong>{wrongAttempts}</strong> 次错误</span>
          <span><strong>{formatDuration(elapsed)}</strong> 用时</span>
        </div>
      </header>
      <main className="crossword-main">
        <div className="crossword-title">
          <div><p className="eyebrow">曲名填字</p><h2>让熟悉的歌名在交叉处相遇</h2></div>
          <div className="crossword-title-actions">
            {surrendered ? <button type="button" className="primary-action compact-action" onClick={resetRound}>再来一盘</button> : <>
              <button type="button" className="secondary-action compact-action" onClick={resetProgress}>重置填写</button>
              <button type="button" className="secondary-action compact-action" onClick={resetRound}>换一盘</button>
              <button type="button" className="danger-action compact-action" onClick={() => setSurrenderDialogOpen(true)}>投降</button>
            </>}
          </div>
        </div>
        <p className="crossword-instruction">点击右侧字块，依次填入棋盘；点击已填字格可退回字块池。每行或每列填满后会自动验证，正确变绿，错误变红。</p>
        <div className="crossword-layout">
          <section className="crossword-board-panel" aria-label="曲名填字棋盘">
            <div className="crossword-board-scroll">
              <div className="crossword-board" style={{ '--board-columns': puzzle.width, '--board-rows': puzzle.height }}>
                {puzzle.cells.map((cell) => {
                  const key = keyFor(cell.row, cell.column);
                  const entrySolved = cell.entryIds.some((id) => statuses[id] === 'solved');
                  const active = selectedEntry && cell.entryIds.includes(selectedEntry.id);
                  const incorrect = cell.entryIds.some((id) => entryErrors[id]?.includes(key));
                  const edgeClasses = cell.entryIds.flatMap((id) => {
                    const entry = entriesById.get(id);
                    const status = statuses[id];
                    if (!entry || (status !== 'solved' && status !== 'wrong')) return [];
                    const keys = entryCellKeys(entry);
                    return [
                      'entry-' + entry.direction + '-' + status,
                      keys[0] === key ? 'entry-' + entry.direction + '-start' : '',
                      keys[keys.length - 1] === key ? 'entry-' + entry.direction + '-end' : '',
                    ].filter(Boolean);
                  });
                  const className = ['crossword-cell', cell.isIntersection ? 'intersection' : '', active && !surrendered ? 'active' : '', dragOverCellKey === key ? 'drag-over' : '', cell.isFixed && !surrendered ? 'fixed' : '', entrySolved ? 'solved' : '', surrendered ? 'revealed' : '', incorrect ? 'incorrect' : '', ...edgeClasses].filter(Boolean).join(' ');
                  const entry = entriesById.get(selectedEntry && cell.entryIds.includes(selectedEntry.id) ? selectedEntry.id : cell.entryIds[0]);
                  const tileId = tileAssignments[key];
                  const character = values[key] || '';
                  const label = entry.number + ' 号曲名第 ' + (entryCellKeys(entry).indexOf(key) + 1) + ' 个字，' + (character || '空白字格');
                  return (
                    <button type="button" key={key} className={className} style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1 }} data-crossword-cell={key} onClick={() => removeTile(cell)} onDragOver={(event) => { if (canDropOnCell(cell)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverCellKey(key); } }} onDragLeave={() => setDragOverCellKey((current) => current === key ? null : current)} onDrop={(event) => handleDrop(event, cell)} aria-label={label}>
                      {character}<span className="cell-state" aria-hidden="true">{surrendered ? '◇' : entrySolved ? '✓' : cell.isFixed ? '◆' : tileId ? '·' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="crossword-legend"><span>◆ 固定字</span><span className="legend-green">边缘绿 = 正确</span><span className="legend-red">边缘红 = 再检查</span>{surrendered && <span>◇ 答案揭晓</span>}</div>
            <section className="crossword-character-bank" aria-label="可用字块">
              <div className="crossword-character-bank-head">
                <div><strong>字块池</strong><small>答案字 + 混淆字，固定上限 {CHARACTER_BANK_LIMIT} 个</small></div>
                <span>{visibleCharacterBank.length}/{characterBank.length} 个匹配 · {usedTileIds.size} 已放入</span>
              </div>
              <div className="crossword-character-search">
                <input type="search" value={characterSearch} onChange={(event) => setCharacterSearch(event.target.value)} placeholder="搜索特定字" aria-label="搜索字块" />
                {characterSearch && <button type="button" onClick={() => setCharacterSearch('')} aria-label="清空字块搜索">清空</button>}
              </div>
              <div className="crossword-character-grid">
                {visibleCharacterBank.map((tile) => (
                  <button type="button" key={tile.id} className="crossword-character" draggable={!usedTileIds.has(tile.id) && !surrendered && !showAnswers} disabled={usedTileIds.has(tile.id) || surrendered || showAnswers} onDragStart={(event) => handleDragStart(event, tile)} onClick={() => placeTile(tile)} aria-label={'字块：' + tile.character}>
                    {tile.character}
                  </button>
                ))}
                {!visibleCharacterBank.length && <p className="crossword-character-empty">没有匹配的字块</p>}
              </div>
            </section>
          </section>
          <section className="crossword-clues" aria-label="待填写曲目">
            {puzzle.entries.map((entry) => {
              const solved = statuses[entry.id] === 'solved';
              const wrong = statuses[entry.id] === 'wrong';
              const selected = selectedEntry && selectedEntry.id === entry.id;
              const lyricsVisible = openLyrics.has(entry.id);
              return (
                <article key={entry.id} className={'crossword-clue ' + (selected && !surrendered ? 'selected ' : '') + (solved ? 'solved ' : '') + (wrong ? 'wrong ' : '') + (surrendered ? 'revealed' : '')}>
                  <button type="button" className="clue-select" onClick={() => { setSelectedEntryId(entry.id); setSelectedCellKey(selectNextEmpty(entry.id, tileAssignments)); }} aria-label={'选择 ' + entry.number + ' 号' + DIRECTIONS[entry.direction].label + '向曲名'}>
                    <span className="clue-number">{entry.number}</span>
                    <span><strong>{DIRECTIONS[entry.direction].label}向 · {entry.characters.length} 字</strong><small>{surrendered ? '答案：《' + entry.song.title + '》' : solved ? '已完成：《' + entry.song.title + '》' : wrong ? '自动验证未通过，请替换字块' : '点击字块开始填写'}</small></span>
                    <span className="clue-status" aria-hidden="true">{surrendered ? '◇' : solved ? '✓' : wrong ? '✕' : '→'}</span>
                  </button>
                  {lyricsVisible && <p className="crossword-lyrics">“{entry.song.lyrics}”</p>}
                  <div className="clue-actions">
                    <button type="button" className="lyrics-toggle" onClick={() => setOpenLyrics((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })}>{lyricsVisible ? '收起歌词' : '歌词提示'}</button>
                    <button type="button" className="submit-entry" onClick={() => { setSelectedEntryId(entry.id); setSelectedCellKey(selectNextEmpty(entry.id, tileAssignments)); }}>{solved ? '已答对' : '填写这首'}</button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
        <p className="crossword-notice" role="status">{notice}</p>
        {import.meta.env.DEV && <details className="crossword-developer"><summary>开发者谜底</summary>{puzzle.entries.map((entry) => <span key={entry.id}>{entry.number}. {entry.song.title}</span>)}</details>}
      </main>
      {completionDialogOpen && <CompletionDialog attempts={attempts} wrongAttempts={wrongAttempts} elapsed={elapsed} onViewAnswers={() => { setCompletionDialogOpen(false); setShowAnswers(true); }} onReplay={resetRound} onBack={onBack} backLabel={backLabel} />}
      {showAnswers && <AnswerPage entries={puzzle.entries} elapsed={elapsed} onReplay={resetRound} onResume={() => setShowAnswers(false)} onBack={onBack} backLabel={backLabel} />}
      {surrenderDialogOpen && <SurrenderDialog onCancel={() => setSurrenderDialogOpen(false)} onConfirm={confirmSurrender} />}
    </div>
  );
}
