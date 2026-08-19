import { useEffect, useMemo, useState } from 'react';

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function moveItem(items, from, to) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function PlayerDot({ player }) {
  return <i className="player-color-marker" style={{ '--player-color': player.color?.color }} title={player.nickname} aria-label={player.nickname} />;
}

export default function MultiplayerSortingGame({ room, self, now, connection, send }) {
  const round = room.sortingRound;
  const songsById = useMemo(() => new Map(round?.songs.map((song) => [song.id, song]) ?? []), [round]);
  const roundKey = round?.songs.map(({ id }) => id).sort().join('|') ?? '';
  const serverOrderIds = self?.orderIds ?? round?.songs.map(({ id }) => id) ?? [];
  const [orderState, setOrderState] = useState(() => ({ roundKey, orderIds: serverOrderIds }));
  const orderIds = orderState.roundKey === roundKey ? orderState.orderIds : serverOrderIds;
  useEffect(() => {
    setOrderState({ roundKey, orderIds: serverOrderIds });
  }, [roundKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!round) return null;
  const playing = room.phase === 'playing';
  const countdown = playing ? room.endsAt - now : room.nextRoundAt - now;
  const locked = !playing || self?.submitted || connection !== 'online';
  const displayOrder = playing ? orderIds : round.answerIds;
  const move = (from, to) => {
    if (locked) return;
    const next = moveItem(orderIds, from, to);
    if (next === orderIds) return;
    setOrderState({ roundKey, orderIds: next });
    send({ type: 'update_sorting_order', orderIds: next });
  };
  return <div className="multiplayer-sorting-game">
    <section className="multiplayer-round-bar sorting">
      <span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 轮</span>
      <time>{playing ? formatTime(countdown) : `${formatTime(countdown)} 后${room.nextLabel ?? (room.roundNumber >= room.roundCount ? '结算' : '下一轮')}`}</time>
      <span>5 首时间线</span>
    </section>
    <section className="multiplayer-sorting-status" aria-label="玩家排序状态">
      {room.players.map((player) => <span key={player.id} className={player.submitted ? 'submitted' : ''}>
        <PlayerDot player={player} /><span>{player.nickname}</span>
        <b>{playing ? player.submitted ? '已提交' : `调整 ${player.moveCount} 次` : !player.submitted ? '未提交 · +0' : `${player.correctPairs}/${player.totalPairs} · ${player.percentage}% · +${player.roundScore}`}</b>
      </span>)}
    </section>
    <section className="multiplayer-sorting-board" aria-label={playing ? '你的歌曲排序列表' : '正确歌曲时间线'}>
      <div className="multiplayer-sorting-heading"><strong>{playing ? '你的时间线' : '正确时间线'}</strong><small>{playing ? '从早到晚拖动排序，提交后不可修改' : '按发布时间从早到晚'}</small></div>
      <ol>
        {displayOrder.map((id, index) => {
          const song = songsById.get(id);
          if (!song) return null;
          return <li
            key={id}
            draggable={!locked}
            onDragStart={(event) => event.dataTransfer.setData('application/x-multiplayer-sorting-index', String(index))}
            onDragOver={(event) => { if (!locked) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); move(Number(event.dataTransfer.getData('application/x-multiplayer-sorting-index')), index); }}
          >
            <span className="sorting-rank">{index + 1}</span>
            <span className="sorting-song-copy"><strong>《{song.title}》</strong><small>{song.staffDisplay}</small></span>
            {!playing && <time>{song.releaseMonth}</time>}
            {playing && <span className="sorting-move-actions"><button type="button" aria-label={`将《${song.title}》上移`} disabled={locked || index === 0} onClick={() => move(index, index - 1)}>↑</button><button type="button" aria-label={`将《${song.title}》下移`} disabled={locked || index === displayOrder.length - 1} onClick={() => move(index, index + 1)}>↓</button></span>}
          </li>;
        })}
      </ol>
    </section>
    {playing && <div className="multiplayer-sorting-actions">
      <button type="button" className="primary-button" disabled={locked} onClick={() => send({ type: 'submit_sorting_order', orderIds })}>{self?.submitted ? '排序已锁定' : '提交排序'}</button>
      {self?.submitted && <p>已提交，等待其他玩家完成……</p>}
    </div>}
  </div>;
}
