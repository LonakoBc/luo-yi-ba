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
  const hintLevel = room.hintLevel ?? 0;
  const yearDebutRevealed = reveal || hintLevel >= 1 || self?.yearDebutRevealed;
  const countsRevealed = reveal || hintLevel >= 2;
  const songs = Array.isArray(answer.representativeSongs) ? answer.representativeSongs : [];
  const displaySong = (song, visible = true) => visible && song && song !== '隐藏曲目' ? '《' + song + '》' : '隐藏曲目';
  const displayCount = (value, visible) => visible ? value : '??';
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
    {playing && <section className="multiplayer-hints producer-hints" aria-label="猜 P 主提示"><div className="producer-hints-heading"><div><p className="eyebrow">共享提示卡片</p><h3>按时间解锁的线索</h3></div><strong>{hintLevel} / 3 已解锁</strong></div><div className="producer-hint-field-grid">
      <article className={'producer-hint-field ' + (yearDebutRevealed ? 'unlocked' : '')}><small>提示 1 · 基础资料</small><dl><div><dt>初投稿年份</dt><dd>{yearDebutRevealed ? answer.debutYear : '????'}</dd></div><div><dt>出道曲</dt><dd>{displaySong(answer.debutSong, yearDebutRevealed)}</dd></div><div><dt>代表曲 E</dt><dd>{displaySong(songs[4], yearDebutRevealed)}</dd></div></dl></article>
      <article className={'producer-hint-field ' + (countsRevealed ? 'unlocked' : '')}><small>提示 2 · 作品规模</small><dl><div><dt>殿堂及以上</dt><dd>{displayCount(answer.hallCount, countsRevealed)}</dd></div><div><dt>传说 / 神话</dt><dd>{displayCount(answer.legendCount, countsRevealed)} / {displayCount(answer.mythCount, countsRevealed)}</dd></div><div><dt>代表曲 D</dt><dd>{displaySong(songs[3], countsRevealed)}</dd></div></dl></article>
      <article className={'producer-hint-field ' + (hintLevel >= 3 || reveal ? 'unlocked' : '')}><small>提示 3 · 代表曲 A / B / C</small><dl><div><dt>代表曲</dt><dd>{[0, 1, 2].map((index) => displaySong(songs[index], hintLevel >= 3 || reveal)).join('、')}</dd></div></dl></article>
    </div></section>}
    {playing && <section className="multiplayer-producer-search"><ProducerSearch service={service} guessedIds={guessedIds} disabled={connection !== 'online' || self?.solved} onGuess={(producer) => guess(producer)} /></section>}
    <ProducerTable answer={answer} guesses={guesses} hintLevel={room.hintLevel ?? 0} yearDebutRevealed={self?.yearDebutRevealed} finished={reveal} showAnswer={false} />
    {reveal && <section className="round-result-strip"><strong>答案 P 主：{answer.name}</strong><span>本轮排名</span>{[...room.players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder).map((player, index) => <span key={player.id}>{index + 1}. <PlayerIdentityInline player={player} /> <b>+{player.roundScore}</b></span>)}</section>}
  </div>;
}

function PlayerIdentityInline({ player }) {
  return <span className="player-identity"><PlayerDot player={player} /><span>{player.nickname}</span></span>;
}
