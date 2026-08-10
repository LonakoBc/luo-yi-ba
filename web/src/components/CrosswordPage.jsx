import { useEffect, useMemo, useRef, useState } from 'react';
import { DIRECTIONS, entryCellKeys, generateCrossword } from '../services/crosswordService';

const keyFor = (row, column) => `${row},${column}`;
const isHanCharacter = (value) => /^\p{Script=Han}$/u.test(value);

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function createInitialValues(puzzle) {
  return Object.fromEntries(puzzle.cells.filter(({ isFixed }) => isFixed).map((cell) => [keyFor(cell.row, cell.column), cell.character]));
}

function ResultDialog({ attempts, wrongAttempts, elapsed, onReplay, onBack, backLabel }) {
  return (
    <div className="modal-backdrop">
      <section className="result-dialog crossword-result" role="dialog" aria-modal="true" aria-labelledby="crossword-result-title">
        <div className="result-icon" aria-hidden="true">字</div>
        <p className="eyebrow">六首全部完成</p>
        <h2 id="crossword-result-title">曲名填字完成！</h2>
        <div className="crossword-result-stats">
          <span><strong>{attempts}</strong><small>次提交</small></span>
          <span><strong>{wrongAttempts}</strong><small>次错误</small></span>
          <span><strong>{formatDuration(elapsed)}</strong><small>本局用时</small></span>
        </div>
        <div className="result-actions">
          <button type="button" className="primary-action" onClick={onReplay}>再来一局</button>
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
  const [values, setValues] = useState(() => puzzle ? createInitialValues(puzzle) : {});
  const [statuses, setStatuses] = useState({});
  const [entryErrors, setEntryErrors] = useState({});
  const [selectedEntryId, setSelectedEntryId] = useState(puzzle?.entries[0]?.id ?? null);
  const [openLyrics, setOpenLyrics] = useState(new Set());
  const [notice, setNotice] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [surrenderDialogOpen, setSurrenderDialogOpen] = useState(false);
  const [surrendered, setSurrendered] = useState(false);
  const startedAt = useRef(Date.now());
  const inputRefs = useRef(new Map());

  const solvedCount = puzzle ? puzzle.entries.filter(({ id }) => statuses[id] === 'solved').length : 0;
  const completed = Boolean(puzzle && solvedCount === puzzle.entries.length);

  useEffect(() => {
    if (completed || surrendered || !puzzle) return undefined;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [completed, surrendered, puzzle]);

  const resetRound = () => {
    startedAt.current = Date.now();
    setElapsed(0);
    setValues({});
    setStatuses({});
    setEntryErrors({});
    setOpenLyrics(new Set());
    setNotice('');
    setAttempts(0);
    setWrongAttempts(0);
    setSurrenderDialogOpen(false);
    setSurrendered(false);
    setSelectedEntryId(null);
    setRound((current) => current + 1);
  };

  const resetProgress = () => {
    startedAt.current = Date.now();
    setElapsed(0);
    setValues(createInitialValues(puzzle));
    setStatuses({});
    setEntryErrors({});
    setOpenLyrics(new Set());
    setNotice('已重置本局全部填写');
    setAttempts(0);
    setWrongAttempts(0);
    setSurrenderDialogOpen(false);
    setSurrendered(false);
    setSelectedEntryId(puzzle.entries[0]?.id ?? null);
  };

  useEffect(() => {
    if (!puzzle) return;
    setValues(createInitialValues(puzzle));
    setSelectedEntryId(puzzle.entries[0]?.id ?? null);
  }, [puzzle]);

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

  const cellsByKey = new Map(puzzle.cells.map((cell) => [keyFor(cell.row, cell.column), cell]));
  const entriesById = new Map(puzzle.entries.map((entry) => [entry.id, entry]));
  const selectedEntry = entriesById.get(selectedEntryId) ?? puzzle.entries[0];

  const selectCellEntry = (cell) => {
    if (cell.entryIds.length === 1) {
      setSelectedEntryId(cell.entryIds[0]);
      return;
    }
    const currentIndex = cell.entryIds.indexOf(selectedEntryId);
    setSelectedEntryId(cell.entryIds[(currentIndex + 1) % cell.entryIds.length]);
  };

  const editableKeysFor = (entry) => entryCellKeys(entry).filter((key) => {
    if (surrendered) return false;
    const cell = cellsByKey.get(key);
    return !cell.isFixed && !cell.entryIds.some((id) => statuses[id] === 'solved') && statuses[entry.id] !== 'solved';
  });

  const focusRelative = (entry, currentKey, offset) => {
    const keys = editableKeysFor(entry);
    const index = keys.indexOf(currentKey);
    const target = keys[index + offset];
    if (target) inputRefs.current.get(target)?.focus();
  };

  const writeCharacters = (entry, startKey, text) => {
    const characters = [...text].filter(isHanCharacter);
    if (!characters.length) return;
    const keys = editableKeysFor(entry);
    const start = Math.max(0, keys.indexOf(startKey));
    setValues((current) => {
      const next = { ...current };
      characters.forEach((character, index) => {
        if (keys[start + index]) next[keys[start + index]] = character;
      });
      return next;
    });
    setEntryErrors((current) => ({ ...current, [entry.id]: [] }));
    const nextKey = keys[Math.min(start + characters.length, keys.length - 1)];
    window.setTimeout(() => inputRefs.current.get(nextKey)?.focus(), 0);
  };

  const clearCharacter = (entry, key) => {
    setValues((current) => ({ ...current, [key]: '' }));
    setEntryErrors((current) => ({ ...current, [entry.id]: (current[entry.id] ?? []).filter((errorKey) => errorKey !== key) }));
  };

  const pasteCharacters = (entry, startKey, text) => {
    const characters = [...text].filter(isHanCharacter);
    if (!characters.length) return;
    if (characters.length === entry.characters.length) {
      const keys = entryCellKeys(entry);
      setValues((current) => {
        const next = { ...current };
        keys.forEach((key, index) => {
          if (!cellsByKey.get(key).isFixed) next[key] = characters[index];
        });
        return next;
      });
      setEntryErrors((current) => ({ ...current, [entry.id]: [] }));
      return;
    }
    writeCharacters(entry, startKey, characters.join(''));
  };

  const submitEntry = (entry) => {
    if (surrendered) return;
    const keys = entryCellKeys(entry);
    if (keys.some((key) => !values[key])) {
      setNotice(`${entry.number} 号曲名尚未填写完整`);
      setSelectedEntryId(entry.id);
      const missing = keys.find((key) => !values[key] && inputRefs.current.has(key));
      inputRefs.current.get(missing)?.focus();
      return;
    }
    const incorrectKeys = keys.filter((key, index) => values[key] !== entry.characters[index]);
    setAttempts((current) => current + 1);
    if (incorrectKeys.length) {
      setWrongAttempts((current) => current + 1);
      setStatuses((current) => ({ ...current, [entry.id]: 'wrong' }));
      setEntryErrors((current) => ({ ...current, [entry.id]: incorrectKeys }));
      setNotice(`${entry.number} 号曲名还有 ${incorrectKeys.length} 个字不正确`);
      return;
    }
    setStatuses((current) => ({ ...current, [entry.id]: 'solved' }));
    setEntryErrors((current) => ({ ...current, [entry.id]: [] }));
    setNotice(`${entry.number} 号曲名填写正确`);
  };

  const confirmSurrender = () => {
    setValues(Object.fromEntries(puzzle.cells.map((cell) => [keyFor(cell.row, cell.column), cell.character])));
    setEntryErrors({});
    setSurrenderDialogOpen(false);
    setSurrendered(true);
    setNotice('答案已揭晓，可以查看六首完整曲名');
  };

  return (
    <div className="page-shell crossword-page">
      <header className="inner-header crossword-header">
        <button type="button" className="back-button" onClick={onBack}>← {backLabel}</button>
        <Brand compact />
        <div className="crossword-summary" aria-label="游戏状态">
          <span><strong>{surrendered ? '答案' : `${solvedCount}/6`}</strong> {surrendered ? '已揭晓' : '已完成'}</span>
          <span><strong>{attempts}</strong> 次提交</span>
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
        <p className="crossword-instruction">两首歌曲的非交叉首字已经给出。逐格填写曲名，再从右侧分别提交六条答案。</p>
        <div className="crossword-layout">
          <section className="crossword-board-panel" aria-label="曲名填字棋盘">
            <div className="crossword-board-scroll">
              <div className="crossword-board" style={{ '--board-columns': puzzle.width, '--board-rows': puzzle.height }}>
                {puzzle.cells.map((cell) => {
                  const key = keyFor(cell.row, cell.column);
                  const entrySolved = cell.entryIds.some((id) => statuses[id] === 'solved');
                  const active = cell.entryIds.includes(selectedEntry.id);
                  const incorrect = cell.entryIds.some((id) => entryErrors[id]?.includes(key));
                  const className = ['crossword-cell', cell.isIntersection ? 'intersection' : '', active && !surrendered ? 'active' : '', entrySolved ? 'solved' : '', surrendered ? 'revealed' : '', incorrect ? 'incorrect' : ''].filter(Boolean).join(' ');
                  const label = `${cell.entryIds.map((id) => entriesById.get(id).number).join('、')} 号曲目的格子`;
                  if (cell.isFixed || entrySolved || surrendered) {
                    return <button type="button" key={key} className={`${className} ${cell.isFixed && !surrendered ? 'fixed' : ''}`} style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1 }} onClick={() => selectCellEntry(cell)} aria-label={`${label}，${cell.character}`}>{cell.character}<span className="cell-state" aria-hidden="true">{surrendered ? '◇' : entrySolved ? '✓' : '◆'}</span></button>;
                  }
                  const entry = entriesById.get(cell.entryIds.includes(selectedEntry.id) ? selectedEntry.id : cell.entryIds[0]);
                  return (
                    <input
                      key={key}
                      ref={(node) => node ? inputRefs.current.set(key, node) : inputRefs.current.delete(key)}
                      className={className}
                      style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1 }}
                      value={values[key] ?? ''}
                      maxLength={1}
                      inputMode="text"
                      aria-label={`${entry.number} 号曲名第 ${entryCellKeys(entry).indexOf(key) + 1} 个字`}
                      onFocus={() => { if (!cell.entryIds.includes(selectedEntry.id)) setSelectedEntryId(entry.id); }}
                      onChange={(event) => {
                        if (!event.target.value) clearCharacter(entry, key);
                        else writeCharacters(entry, key, event.target.value);
                      }}
                      onPaste={(event) => { event.preventDefault(); pasteCharacters(entry, key, event.clipboardData.getData('text')); }}
                      onKeyDown={(event) => {
                        if (event.key === 'Backspace' && !values[key]) {
                          event.preventDefault();
                          const editableKeys = editableKeysFor(entry);
                          const previousKey = editableKeys[editableKeys.indexOf(key) - 1];
                          if (previousKey) {
                            clearCharacter(entry, previousKey);
                            inputRefs.current.get(previousKey)?.focus();
                          }
                        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') focusRelative(entry, key, 1);
                        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') focusRelative(entry, key, -1);
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="crossword-legend"><span>◆ 固定首字</span><span>✓ 已完成</span><span>! 填写错误</span>{surrendered && <span>◇ 答案揭晓</span>}</div>
          </section>
          <section className="crossword-clues" aria-label="待填写曲目">
            {puzzle.entries.map((entry) => {
              const solved = statuses[entry.id] === 'solved';
              const selected = selectedEntry.id === entry.id;
              const lyricsVisible = openLyrics.has(entry.id);
              return (
                <article key={entry.id} className={`crossword-clue ${selected && !surrendered ? 'selected' : ''} ${solved ? 'solved' : ''} ${surrendered ? 'revealed' : ''}`}>
                  <button type="button" className="clue-select" onClick={() => setSelectedEntryId(entry.id)} aria-label={`选择 ${entry.number} 号${DIRECTIONS[entry.direction].label}向曲名`}>
                    <span className="clue-number">{entry.number}</span>
                    <span><strong>{DIRECTIONS[entry.direction].label}向 · {entry.characters.length} 字</strong><small>{surrendered ? `答案：《${entry.song.title}》` : solved ? `已完成：《${entry.song.title}》` : '等待填写'}</small></span>
                    <span className="clue-status" aria-hidden="true">{surrendered ? '◇' : solved ? '✓' : '→'}</span>
                  </button>
                  {lyricsVisible && <p className="crossword-lyrics">“{entry.song.lyrics}”</p>}
                  <div className="clue-actions">
                    <button type="button" className="lyrics-toggle" onClick={() => setOpenLyrics((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })}>{lyricsVisible ? '收起歌词' : '歌词提示'}</button>
                    <button type="button" className="submit-entry" disabled={solved || surrendered} onClick={() => submitEntry(entry)}>{surrendered ? '答案已揭晓' : solved ? '已答对' : '提交本条'}</button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>
        <p className="crossword-notice" role="status">{notice}</p>
        {import.meta.env.DEV && <details className="crossword-developer"><summary>开发者谜底</summary>{puzzle.entries.map((entry) => <span key={entry.id}>{entry.number}. {entry.song.title}</span>)}</details>}
      </main>
      {completed && <ResultDialog attempts={attempts} wrongAttempts={wrongAttempts} elapsed={elapsed} onReplay={resetRound} onBack={onBack} backLabel={backLabel} />}
      {surrenderDialogOpen && <SurrenderDialog onCancel={() => setSurrenderDialogOpen(false)} onConfirm={confirmSurrender} />}
    </div>
  );
}
