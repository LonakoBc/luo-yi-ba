import { useMemo, useState } from 'react';

const keyFor = (row, column) => `${row},${column}`;

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

function entryKeys(entry) {
  const horizontal = entry.direction === 'across';
  return Array.from({ length: entry.length }, (_, index) => keyFor(
    entry.row + (horizontal ? 0 : index),
    entry.column + (horizontal ? index : 0),
  ));
}

function PlayerDot({ player }) {
  return <i className="player-color-marker" style={{ '--player-color': player.color?.color }} title={player.nickname} aria-label={player.nickname} />;
}

export default function MultiplayerCrosswordGame({ room, self, now, connection, send }) {
  const round = room.crosswordRound;
  const playing = room.phase === 'playing';
  const reveal = room.phase === 'round-result';
  const [selectedKey, setSelectedKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const assignments = self?.assignments ?? {};
  const statuses = self?.statuses ?? {};
  const errors = self?.errors ?? {};
  const cellsByKey = useMemo(() => new Map((round?.cells ?? []).map((cell) => [keyFor(cell.row, cell.column), cell])), [round]);
  const tileById = useMemo(() => new Map((round?.characterBank ?? []).map((tile) => [tile.id, tile])), [round]);
  const usedTileIds = new Set(Object.values(assignments));
  const selectedCell = selectedKey ? cellsByKey.get(selectedKey) : null;
  const firstEmpty = round?.cells.find((cell) => !cell.isFixed && !assignments[keyFor(cell.row, cell.column)]);
  const activeKey = selectedCell && !selectedCell.isFixed ? selectedKey : firstEmpty ? keyFor(firstEmpty.row, firstEmpty.column) : null;

  if (!round) return null;

  const updateAssignments = (next) => {
    if (playing && connection === 'online') send({ type: 'update_crossword_assignments', assignments: next });
  };
  const canUseCell = (cell) => playing && connection === 'online' && !cell.isFixed && !assignments[keyFor(cell.row, cell.column)] && !cell.entryIds.some((id) => statuses[id] === 'solved');
  const place = (tileId, preferredKey = activeKey) => {
    const tile = tileById.get(tileId);
    const cell = preferredKey ? cellsByKey.get(preferredKey) : null;
    if (!tile || !cell || !canUseCell(cell) || usedTileIds.has(tileId)) return;
    updateAssignments({ ...assignments, [preferredKey]: tileId });
    setSelectedKey(preferredKey);
  };
  const remove = (cell) => {
    const key = keyFor(cell.row, cell.column);
    if (!playing || cell.isFixed || cell.entryIds.some((id) => statuses[id] === 'solved') || !assignments[key]) return;
    const next = { ...assignments };
    delete next[key];
    updateAssignments(next);
    setSelectedKey(key);
  };
  const handleDrop = (event, cell) => {
    event.preventDefault();
    setDragOverKey(null);
    place(event.dataTransfer.getData('text/plain'), keyFor(cell.row, cell.column));
  };
  const countdown = playing ? room.endsAt - now : room.nextRoundAt - now;
  const solvedCount = self?.solvedCount ?? 0;

  return <div className="multiplayer-crossword-game">
    <section className="multiplayer-round-bar crossword">
      <span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 盘</span>
      <time>{playing ? formatTime(countdown) : `${formatTime(countdown)} 后${room.roundNumber >= room.roundCount ? '结算' : '下一盘'}`}</time>
      <span>{solvedCount} / {round.entries.length} 首完成</span>
    </section>
    <section className="multiplayer-crossword-status" aria-label="玩家填字状态">
      {room.players.map((player) => <span key={player.id}><PlayerDot player={player} /><b>{player.nickname}</b><small>{player.id === self?.id ? `${player.solvedCount ?? 0}/6 首 · ` : `${player.solvedCount ?? 0}/6 首 · `}{reveal ? `+${player.roundScore}` : player.id === self?.id ? '填写中' : '作答中'}</small></span>)}
    </section>
    <p className="multiplayer-crossword-instruction">所有玩家面对同一盘题目，90 秒结束后按完成数量结算；点击字块或拖动字块到指定格子。</p>
    <div className="multiplayer-crossword-layout">
      <section className="crossword-board-panel" aria-label="多人曲名填字棋盘">
        <div className="crossword-board-scroll"><div className="crossword-board" style={{ '--board-columns': round.width, '--board-rows': round.height }}>
          {round.cells.map((cell) => {
            const key = keyFor(cell.row, cell.column);
            const tile = tileById.get(assignments[key]);
            const incorrect = Object.values(errors).some((keys) => keys.includes(key));
            const solved = cell.entryIds.some((id) => statuses[id] === 'solved');
            const className = ['crossword-cell', cell.isIntersection ? 'intersection' : '', cell.isFixed ? 'fixed' : '', solved ? 'solved' : '', incorrect ? 'incorrect' : '', activeKey === key ? 'active' : '', dragOverKey === key ? 'drag-over' : '', reveal ? 'revealed' : ''].filter(Boolean).join(' ');
            return <button type="button" key={key} data-crossword-cell={key} className={className} style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1 }} disabled={!playing} onClick={() => remove(cell)} onDragOver={(event) => { if (canUseCell(cell)) { event.preventDefault(); setDragOverKey(key); } }} onDragLeave={() => setDragOverKey((current) => current === key ? null : current)} onDrop={(event) => handleDrop(event, cell)} aria-label={`${key} ${tile?.character || cell.character || '空白字格'}`}>
              {tile?.character || cell.character || ''}<span className="cell-state" aria-hidden="true">{cell.isFixed ? '◆' : solved ? '✓' : ''}</span>
            </button>;
          })}
        </div></div>
        <div className="crossword-legend"><span>◆ 固定字</span><span className="legend-green">边缘绿 = 正确</span><span className="legend-red">边缘红 = 再检查</span></div>
        <section className="crossword-character-bank" aria-label="可用字块">
          <div className="crossword-character-bank-head"><div><strong>字块池</strong><small>答案字 + 混淆字 · {round.characterBank.length} 个</small></div><span>{usedTileIds.size} 已放入</span></div>
          <div className="crossword-character-grid">{round.characterBank.map((tile) => <button type="button" key={tile.id} className="crossword-character" draggable={playing && !usedTileIds.has(tile.id)} disabled={!playing || usedTileIds.has(tile.id)} onDragStart={(event) => { event.dataTransfer.setData('text/plain', tile.id); event.dataTransfer.effectAllowed = 'move'; }} onClick={() => place(tile.id)} aria-label={`字块：${tile.character}`}>{tile.character}</button>)}</div>
        </section>
      </section>
      <section className="crossword-clues" aria-label="待填写曲目">{round.entries.map((entry) => {
        const solved = statuses[entry.id] === 'solved';
        const wrong = statuses[entry.id] === 'wrong';
        return <article key={entry.id} className={`crossword-clue ${solved ? 'solved' : ''} ${wrong ? 'wrong' : ''} ${reveal ? 'revealed' : ''}`}>
          <button type="button" className="clue-select" onClick={() => setSelectedKey(entryKeys(entry).find((key) => !assignments[key]) || entryKeys(entry)[0])}><span className="clue-number">{entry.number}</span><span><strong>{entry.direction === 'across' ? '横' : '纵'}向 · {entry.length} 字</strong><small>{reveal && entry.song ? `答案：《${entry.song.title}》` : solved ? '已完成' : wrong ? '自动验证未通过，请替换字块' : '点击字块开始填写'}</small></span><span className="clue-status">{solved ? '✓' : wrong ? '✕' : '→'}</span></button>
        </article>;
      })}</section>
    </div>
    {reveal && <section className="round-result-strip"><strong>本盘得分</strong>{[...room.players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder).map((player) => <span key={player.id}><PlayerIdentityInline player={player} /> <b>+{player.roundScore}</b></span>)}</section>}
  </div>;
}

function PlayerIdentityInline({ player }) {
  return <span className="player-identity"><PlayerDot player={player} /><span>{player.nickname}</span></span>;
}
