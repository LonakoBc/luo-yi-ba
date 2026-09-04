import { useMemo } from 'react';
import ProducerTable from './ProducerTable';
import { ProducerSearch } from './ProducerGamePage';
import { createProducerGameService } from '../services/producerGameService';

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

const hiddenAnswer = { name: '答案 P 主', debutYear: 0, debutSong: '', hallCount: 0, legendCount: 0, mythCount: 0, representativeSongs: [] };

function PlayerDot({ player }) {
  return <i className="player-color-marker" style={{ '--player-color': player.color?.color }} title={player.nickname} aria-label={player.nickname} />;
}

export default function MultiplayerProducerGame({ room, self, producers, now, connection, send }) {
  const playing = room.phase === 'playing';
  const reveal = room.phase === 'round-result';
  const answer = room.producerRound?.answer ?? hiddenAnswer;
  const safeProducers = Array.isArray(producers) ? producers : [];
  const service = useMemo(() => createProducerGameService(safeProducers), [safeProducers]);
  const guesses = Array.isArray(self?.guesses) ? self.guesses : [];
  const guessedIds = useMemo(() => new Set(guesses.map((entry) => entry?.producer?.id).filter(Boolean)), [guesses]);
  const countdown = playing ? room.endsAt - now : room.nextRoundAt - now;
  const guess = (producer) => {
    if (producer && playing && connection === 'online') send({ type: 'submit_producer_guess', producerId: producer.id });
  };
  return <div className="multiplayer-producer-game">
    <section className="multiplayer-round-bar producer"><span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 轮</span><time>{playing ? formatTime(countdown) : `${formatTime(countdown)} 后${room.roundNumber >= room.roundCount ? '结算' : '下一轮'}`}</time><span>名 P 模式 · 提示 {room.hintLevel ?? 0} / 3</span></section>
    <section className="multiplayer-producer-status" aria-label="玩家猜P主状态">{room.players.map((player) => <span key={player.id}><PlayerDot player={player} /><b>{player.nickname}</b><small>{player.guessCount ?? 0} 次猜测 · {reveal ? `+${player.roundScore}` : player.solved ? '已猜出' : '作答中'}</small></span>)}</section>
    {playing && <aside className="multiplayer-hints producer-hints"><p className="eyebrow">按时间解锁的共享提示</p><div><span className={(room.hintLevel ?? 0) >= 1 ? 'unlocked' : ''}>1 · 初投稿年份、出道曲、代表曲 E</span><span className={(room.hintLevel ?? 0) >= 2 ? 'unlocked' : ''}>2 · 殿堂 / 传说 / 神话数量、代表曲 D</span><span className={(room.hintLevel ?? 0) >= 3 ? 'unlocked' : ''}>3 · 其余代表曲</span></div></aside>}
    {playing && <section className="multiplayer-producer-search"><ProducerSearch service={service} guessedIds={guessedIds} disabled={connection !== 'online' || self?.solved} onGuess={(producer) => guess(producer)} /></section>}
    <ProducerTable answer={answer} guesses={guesses} hintLevel={room.hintLevel ?? 0} yearDebutRevealed={self?.yearDebutRevealed} finished={reveal} />
    {reveal && <section className="round-result-strip"><strong>本轮排名</strong>{[...room.players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder).map((player, index) => <span key={player.id}>{index + 1}. <PlayerIdentityInline player={player} /> <b>+{player.roundScore}</b></span>)}</section>}
  </div>;
}

function PlayerIdentityInline({ player }) {
  return <span className="player-identity"><PlayerDot player={player} /><span>{player.nickname}</span></span>;
}
