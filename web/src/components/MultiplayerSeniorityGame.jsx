import { useState } from 'react';

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

function PlayerDot({ player }) {
  return <i className="player-color-marker" style={{ '--player-color': player.color?.color }} title={player.nickname} aria-label={player.nickname} />;
}

function SongImage({ song }) {
  const [failed, setFailed] = useState(false);
  if (!song.imageUrl || failed) return <span className="multiplayer-seniority-placeholder" aria-label="歌曲图片暂无">♪</span>;
  return <img src={song.imageUrl} alt={`《${song.title}》歌曲图片`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function SeniorityChoiceCard({ song, room, self, disabled, onChoose }) {
  const reveal = room.phase === 'round-result';
  const correct = reveal && room.seniorityRound.correctId === song.id;
  const selected = self?.choiceId === song.id;
  const players = reveal ? room.players.filter((player) => player.choiceId === song.id) : [];
  return <button
    type="button"
    className={`multiplayer-seniority-card ${correct ? 'correct' : ''} ${reveal && selected && !correct ? 'wrong' : ''} ${selected ? 'selected' : ''}`}
    disabled={disabled}
    onClick={() => onChoose(song.id)}
    aria-label={`选择《${song.title}》作为更早发布的歌曲`}
  >
    <span className="multiplayer-seniority-cover"><SongImage song={song} /></span>
    <span className="multiplayer-seniority-copy">
      <strong>《{song.title}》</strong>
      <small>{song.staffDisplay}</small>
      <span>歌姬 · {song.singersDisplay}</span>
      <span>标注 · {song.special}</span>
      <time className={reveal ? 'revealed' : ''}>发布时间：{reveal ? song.releaseMonth : '????-??'}</time>
      {reveal && <span className="multiplayer-seniority-choices" aria-label={`选择《${song.title}》的玩家`}>
        {players.length ? players.map((player) => <PlayerDot key={player.id} player={player} />) : <small>无人选择</small>}
      </span>}
      {correct && <b className="multiplayer-seniority-result">✓ 更早发布</b>}
    </span>
  </button>;
}

export default function MultiplayerSeniorityGame({ room, self, now, connection, send }) {
  const playing = room.phase === 'playing';
  const countdown = playing ? room.endsAt - now : room.nextRoundAt - now;
  const locked = !playing || self?.answered || connection !== 'online';
  const round = room.seniorityRound;
  if (!round) return null;
  return <div className="multiplayer-seniority-game">
    <section className="multiplayer-round-bar seniority">
      <span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 题</span>
      <time>{playing ? formatTime(countdown) : `${formatTime(countdown)} 后${room.nextLabel ?? (room.roundNumber >= room.roundCount ? '结算' : '下一题')}`}</time>
      <span>{round.difficulty.label}</span>
    </section>
    <section className="multiplayer-seniority-status" aria-label="玩家作答状态">
      {room.players.map((player) => <span key={player.id} className={player.answered ? 'answered' : ''}><PlayerDot player={player} />{player.nickname}<b>{room.phase === 'round-result' ? !player.answered ? '未作答 +0' : player.correct ? `正确 +${player.roundScore}` : '错误 +0' : player.answered ? '已作答' : '思考中'}</b></span>)}
    </section>
    <section className="multiplayer-seniority-board" aria-label={`第 ${room.roundNumber} 题`}>
      <SeniorityChoiceCard song={round.left} room={room} self={self} disabled={locked} onChoose={(songId) => send({ type: 'submit_seniority_choice', songId })} />
      <div className="seniority-versus" aria-hidden="true">VS</div>
      <SeniorityChoiceCard song={round.right} room={room} self={self} disabled={locked} onChoose={(songId) => send({ type: 'submit_seniority_choice', songId })} />
    </section>
    {playing && self?.answered && <p className="multiplayer-seniority-waiting">选择已锁定，等待其他玩家作答……</p>}
  </div>;
}
