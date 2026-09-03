import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveMusicGuessClipUrl } from '../services/musicGuessService';

const CLIP_SECONDS = 15;

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

function PlayerDot({ player }) {
  return <i className="player-color-marker" style={{ '--player-color': player.color?.color }} title={player.nickname} aria-label={player.nickname} />;
}

export default function MultiplayerMusicGuessGame({ room, self, now, connection, send }) {
  const round = room.musicGuessRound;
  const [playingAudio, setPlayingAudio] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const audioRef = useRef(null);
  const clipUrl = useMemo(() => resolveMusicGuessClipUrl(round?.clipFileName), [round?.clipFileName]);
  useEffect(() => setElapsedSeconds(0), [round?.clipFileName]);
  if (!round) return null;
  const playing = room.phase === 'playing';
  const reveal = room.phase === 'round-result';
  const countdown = playing ? room.endsAt - now : room.nextRoundAt - now;
  const choose = (id) => {
    if (playing && connection === 'online' && !self?.answered) send({ type: 'submit_music_guess', trackId: id });
  };
  const selectedId = self?.selectedId;
  const playClip = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      setElapsedSeconds(0);
      const promise = audio.play();
      if (promise && typeof promise.then === 'function') await promise;
    } catch { setPlayingAudio(false); }
  };
  const handleTimeUpdate = (event) => {
    const seconds = Math.min(CLIP_SECONDS, event.currentTarget.currentTime || 0);
    setElapsedSeconds(seconds);
    if (event.currentTarget.currentTime >= CLIP_SECONDS) {
      event.currentTarget.pause();
      setPlayingAudio(false);
    }
  };
  return <div className="multiplayer-music-guess-game">
    <section className="multiplayer-round-bar music-guess"><span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 题</span><time>{playing ? formatTime(countdown) : `${formatTime(countdown)} 后${room.roundNumber >= room.roundCount ? '结算' : '下一题'}`}</time><span>听歌识曲</span></section>
    <section className="multiplayer-music-status" aria-label="玩家听歌识曲状态">{room.players.map((player) => <span key={player.id}><PlayerDot player={player} /><b>{player.nickname}</b><small>{reveal ? player.correct ? `答对 +${player.roundScore}` : '答错 +0' : player.answered ? '已选择' : '等待选择'}</small></span>)}</section>
    <section className="multiplayer-music-board" aria-label="多人听歌识曲题目">
      <div className="multiplayer-music-player"><strong>所有玩家播放同一个 15 秒片段</strong><div className="multiplayer-music-player-actions"><button type="button" className="music-guess-play-button" onClick={playClip}>{playingAudio ? '重新播放' : elapsedSeconds >= CLIP_SECONDS ? '再次播放' : '播放片段'}</button><span>{Math.floor(elapsedSeconds)} / {CLIP_SECONDS} 秒</span></div><audio ref={audioRef} src={clipUrl} preload="auto" controls onPlay={() => setPlayingAudio(true)} onPause={() => setPlayingAudio(false)} onEnded={() => setPlayingAudio(false)} onTimeUpdate={handleTimeUpdate} /><small>{playingAudio ? '正在播放片段' : elapsedSeconds >= CLIP_SECONDS ? '片段播放完毕，现在选择歌曲' : '点击播放，听完后选择歌曲'}</small></div>
      <div className="multiplayer-music-options">{round.options.map((option) => {
        const correct = reveal && option.id === round.answerId;
        const wrong = reveal && option.id === selectedId && option.id !== round.answerId;
        return <button type="button" key={option.id} className={`${selectedId === option.id ? 'selected ' : ''}${correct ? 'correct ' : ''}${wrong ? 'wrong' : ''}`} disabled={!playing || connection !== 'online' || Boolean(self?.answered)} onClick={() => choose(option.id)}><span>《{option.name}》</span>{correct && <small>✓ 正确答案</small>}{wrong && <small>× 你的选择</small>}</button>;
      })}</div>
    </section>
    {reveal && <section className="round-result-strip"><strong>本题排名</strong>{[...room.players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder).map((player, index) => <span key={player.id}>{index + 1}. <PlayerIdentityInline player={player} /> <b>+{player.roundScore}</b></span>)}</section>}
  </div>;
}

function PlayerIdentityInline({ player }) {
  return <span className="player-identity"><PlayerDot player={player} /><span>{player.nickname}</span></span>;
}
