import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMusicGuessService, getMusicGuessTracks, musicGuessEvaluation } from '../services/musicGuessService';
import './MusicGuessPage.css';

const CLIP_SECONDS = 15;
const FINISHED_STATUSES = ['lost', 'settled', 'completed', 'time-up'];
const SHOW_DEVELOPER_TOOLS = import.meta.env.DEV;

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, '0');
  return minutes + ':' + remainder;
}

function AudioBars({ playing }) {
  return <span className={'music-guess-bars ' + (playing ? 'playing' : '')} aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((bar) => <i key={bar} />)}</span>;
}

function LoadingPage({ Brand, message = '正在读取本地曲库……' }) {
  return <div className="page-shell music-guess-page"><header className="inner-header music-guess-header"><Brand compact /></header><main className="music-guess-state"><span className="music-guess-state-icon" aria-hidden="true">♫</span><h2>{message}</h2><p>正在准备 15 秒猜曲片段，请稍候。</p></main></div>;
}

function MusicGuessDeveloperTools({ tracks, queuedTrackId, onQueue, onRestart }) {
  const [open, setOpen] = useState(false);
  const [trackId, setTrackId] = useState(queuedTrackId || tracks[0]?.id || '');
  const selectedTrack = tracks.find((track) => track.id === trackId);
  const queuedTrack = tracks.find((track) => track.id === queuedTrackId);

  useEffect(() => {
    if (queuedTrackId) setTrackId(queuedTrackId);
  }, [queuedTrackId]);

  return <aside className="developer-tools music-guess-developer-tools">
    <button type="button" className="developer-toggle" onClick={() => setOpen((value) => !value)}>管理员测试</button>
    {open && <div className="developer-panel">
      <strong>本地测试模式</strong>
      <label htmlFor="music-guess-developer-track">指定下一题音频</label>
      <select id="music-guess-developer-track" value={trackId} onChange={(event) => setTrackId(event.target.value)}>
        {tracks.map((track) => <option key={track.id} value={track.id}>{track.name} · {track.clipFileName}</option>)}
      </select>
      {queuedTrack && <p className="music-guess-developer-status">已排队：{queuedTrack.name}（下一题生效）</p>}
      {selectedTrack && <button type="button" onClick={() => { onQueue(trackId); setOpen(false); }}>设为下一题</button>}
      {selectedTrack && <button type="button" className="music-guess-developer-secondary" onClick={() => { onRestart(trackId); setOpen(false); }}>立即重开并指定</button>}
    </div>}
  </aside>;
}
function GuessResult({ game, total, onRestart, onBack, mode, durationSeconds }) {
  const evaluation = musicGuessEvaluation(game.score, total, { mode, lifeBonus: game.lifeBonus });
  const correctCount = game.history.filter(({ outcome }) => outcome === 'correct').length;
  const wrongCount = game.history.filter(({ outcome }) => outcome === 'wrong').length;
  return <div className="modal-backdrop" role="presentation"><section className="result-dialog music-guess-result" role="dialog" aria-modal="true" aria-labelledby="music-guess-result-title">
    <p className="eyebrow">{game.status === 'lost' ? '三条命用完' : game.status === 'time-up' ? '时间到' : game.status === 'completed' ? '歌单挑战完成' : '本局已结算'}</p>
    <div className="result-icon" aria-hidden="true">♫</div>
    <h2 id="music-guess-result-title">{evaluation.title}</h2>
    <p className="music-guess-evaluation">{evaluation.description}</p>
    <div className="music-guess-result-stats"><span><strong>{game.score}</strong>得分</span><span><strong>{correctCount}</strong>猜对</span><span><strong>{wrongCount}</strong>猜错</span>{mode === 'timed' ? <span><strong>{game.lifeBonus}</strong>生命奖励</span> : <span><strong>{game.usedIds.length}</strong>首歌曲</span>}</div>
    {mode === 'timed' && <p className="music-guess-timed-result-note">{formatCountdown(durationSeconds)} 限时模式</p>}
    <div className="music-guess-history" aria-label="本局猜曲回顾">{game.history.map((round) => <article key={round.number} className={'music-guess-history-row ' + round.outcome}><strong>第 {round.number} 题</strong><span>《{round.answer.name}》</span><small>{round.outcome === 'correct' ? '✓ 猜对了' : round.outcome === 'wrong' ? '× 猜错了' : '— 未作答'}</small></article>)}</div>
    <div className="result-actions"><button type="button" className="primary-button" onClick={onRestart}>再来一局</button><button type="button" className="ghost-button" onClick={onBack}>返回歌单</button></div>
  </section></div>;
}

export default function MusicGuessPage({ playlist, onBack, Brand, random = Math.random, manifest, mode = 'unlimited', durationSeconds = 0 }) {
  const [tracks, setTracks] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const service = useMemo(() => tracks ? createMusicGuessService(tracks, { random, mode, durationSeconds }) : null, [tracks, random, mode, durationSeconds]);
  const [game, setGame] = useState(null);
  const [showSurrender, setShowSurrender] = useState(false);
  const [queuedTrackId, setQueuedTrackId] = useState('');
  const [playerState, setPlayerState] = useState('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  const [timerSession, setTimerSession] = useState(0);
  const audioRef = useRef(null);
  const playerTimerRef = useRef(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    let cancelled = false;
    setTracks(null);
    setLoadError('');
    try {
      const nextTracks = getMusicGuessTracks(playlist, { manifest });
      if (!cancelled) setTracks(nextTracks);
    } catch (error) {
      if (!cancelled) setLoadError(error.message || '本地曲库加载失败');
    }
    return () => { cancelled = true; };
  }, [playlist, retry, manifest]);

  useEffect(() => {
    if (service) setGame(service.startGame());
  }, [service]);

  useEffect(() => {
    if (mode !== 'timed' || !game || !durationSeconds) return undefined;
    const deadline = Date.now() + durationSeconds * 1000;
    let intervalId;
    const finishTimer = () => {
      const current = gameRef.current;
      if (!current || FINISHED_STATUSES.includes(current.status)) return;
      setRemainingSeconds(0);
      clearClip();
      setGame((currentGame) => service.timeUp(currentGame));
    };
    const tick = () => {
      const current = gameRef.current;
      if (!current || FINISHED_STATUSES.includes(current.status)) {
        if (intervalId) window.clearInterval(intervalId);
        return;
      }
      const nextSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(nextSeconds);
      if (nextSeconds === 0) {
        if (intervalId) window.clearInterval(intervalId);
        finishTimer();
      }
    };
    setRemainingSeconds(durationSeconds);
    tick();
    intervalId = window.setInterval(tick, 250);
    const timeoutId = window.setTimeout(finishTimer, durationSeconds * 1000);
    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [service, mode, durationSeconds, timerSession, Boolean(game)]);

  const finishClip = useCallback(() => {
    if (playerTimerRef.current) {
      window.clearTimeout(playerTimerRef.current);
      playerTimerRef.current = null;
    }
    audioRef.current?.pause();
    setPlayerState('finished');
  }, []);

  const clearClip = useCallback(() => {
    if (playerTimerRef.current) {
      window.clearTimeout(playerTimerRef.current);
      playerTimerRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* Some browsers reject resetting an unloaded media element. */ }
    }
    setPlayerState('idle');
  }, []);

  const startClip = useCallback(async () => {
    const currentGame = gameRef.current;
    const audio = audioRef.current;
    if (!currentGame || currentGame.status !== 'playing' || !audio) return;
    clearClip();
    setPlayerState('loading');
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.load();
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') await playPromise;
      if (gameRef.current?.status !== 'playing') return;
      setPlayerState('playing');
      playerTimerRef.current = window.setTimeout(finishClip, CLIP_SECONDS * 1000);
    } catch {
      setPlayerState('error');
    }
  }, [clearClip, finishClip]);

  const handlePlayerError = useCallback(() => {
    if (gameRef.current?.status === 'playing') setPlayerState('error');
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime >= CLIP_SECONDS) finishClip();
  }, [finishClip]);

  useEffect(() => {
    if (!game) return undefined;
    clearClip();
    if (game.status !== 'playing') return clearClip;
    const autoplayTimer = window.setTimeout(() => { void startClip(); }, 0);
    return () => {
      window.clearTimeout(autoplayTimer);
      clearClip();
    };
  }, [clearClip, startClip, game?.round.answer.id, game?.status]);

  if (loadError) return <div className="page-shell music-guess-page"><header className="inner-header music-guess-header"><Brand compact /><button type="button" className="back-button" onClick={onBack}>← 选择歌单</button></header><main className="music-guess-state"><span className="music-guess-state-icon error" aria-hidden="true">!</span><h2>{loadError}</h2><p>请检查本地曲库与 15 秒片段，或稍后重试。</p><div className="result-actions"><button type="button" className="primary-button" onClick={() => setRetry((value) => value + 1)}>重新加载</button><button type="button" className="ghost-button" onClick={onBack}>返回歌单</button></div></main></div>;
  if (!tracks || !game) return <LoadingPage Brand={Brand} />;

  const resolved = FINISHED_STATUSES.includes(game.status) || game.status === 'revealed';
  const playing = playerState === 'playing';
  const playerLabel = playerState === 'finished'
    ? '片段播放完毕'
    : playerState === 'error'
      ? '音频加载失败，请再次播放'
      : playerState === 'loading'
          ? '正在加载音频'
        : playing
          ? '正在播放片段'
          : '点击播放按钮开始';
  const chooseAnswer = (id) => {
    if (game.status !== 'playing') return;
    clearClip();
    setGame((current) => service.chooseAnswer(current, id));
  };
  const restart = (forcedAnswerId = null) => {
    clearClip();
    setGame(service.startGame(forcedAnswerId));
    setRemainingSeconds(durationSeconds);
    setTimerSession((value) => value + 1);
    setQueuedTrackId('');
    setShowSurrender(false);
  };
  const advanceRound = () => {
    clearClip();
    setGame(service.nextRound(game, queuedTrackId || null));
    setQueuedTrackId('');
  };
  const surrender = () => {
    clearClip();
    setGame((current) => service.surrender(current));
  };

  return <div className="page-shell music-guess-page music-guess-game-page">
    {SHOW_DEVELOPER_TOOLS && <MusicGuessDeveloperTools tracks={tracks} queuedTrackId={queuedTrackId} onQueue={setQueuedTrackId} onRestart={restart} />}
    <header className="inner-header music-guess-header"><Brand compact /><div className="music-guess-header-actions"><span className="music-guess-local-label">本地曲库</span><button type="button" className="back-button" onClick={onBack}>← 选择曲目</button></div></header>
    <main className="music-guess-main">
      <div className="music-guess-heading"><div><p className="eyebrow">本地曲库猜曲 · {playlist.title}</p><h2>听歌识曲</h2><p>{mode === 'timed' ? '在 ' + Math.round(durationSeconds / 60) + ' 分钟内尽可能猜出更多曲名，三条命仍然有效。' : '根据所选本地曲库播放 15 秒片段，在三条命内猜出尽可能多的曲名。'}</p></div><div className="music-guess-stats" aria-label="游戏状态">{mode === 'timed' && <span><strong>{formatCountdown(remainingSeconds)}</strong>剩余</span>}<span><strong>{'♥'.repeat(game.lives)}{'♡'.repeat(3 - game.lives)}</strong>生命</span><span><strong>{game.score}</strong>得分</span><span><strong>{game.round.number}</strong>题</span></div></div>
      <section className="music-guess-board" aria-label={'第 ' + game.round.number + ' 题'}>
        <div className="music-guess-player-row">
          <div className="music-guess-video-preview" aria-hidden="true"><span>♫</span><small>15s</small></div>
          <button type="button" className="music-guess-play-button" onClick={startClip} aria-label={playing ? '重新播放猜曲片段' : '播放猜曲片段'}><span className="music-guess-play-icon" aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span><span className="music-guess-play-text">{playing ? '重新播放' : '点击播放'}</span><AudioBars playing={playing} /></button>
          <div className="music-guess-player-copy"><strong>第 {game.round.number} 题 · 15 秒片段</strong><small>{playerLabel} · 从第 0 秒开始，播放最多 {CLIP_SECONDS} 秒</small></div>
          <button type="button" className="music-guess-replay" onClick={startClip} disabled={game.status !== 'playing'}>↻ 再次播放</button>
        </div>
        <audio key={game.round.answer.id} ref={audioRef} src={game.round.answer.clipUrl} preload="auto" aria-label={'第 ' + game.round.number + ' 题猜曲音频'} onError={handlePlayerError} onEnded={finishClip} onTimeUpdate={handleTimeUpdate} />
        {game.round.options.map((option) => {
          const optionClass = resolved ? option.id === game.round.answer.id ? 'correct' : option.id === game.round.selectedId ? 'wrong' : '' : option.id === game.round.selectedId ? 'selected' : '';
          return <button type="button" key={option.id} className={'music-guess-option ' + optionClass} disabled={game.status !== 'playing'} onClick={() => chooseAnswer(option.id)}><span>{option.name}</span>{resolved && option.id === game.round.answer.id && <small>✓ 正确答案</small>}{resolved && option.id === game.round.selectedId && option.id !== game.round.answer.id && <small>× 你的选择</small>}</button>;
        })}
      </section>
      <div className="music-guess-actions">{game.status === 'revealed' && <button type="button" className="primary-button" onClick={advanceRound}>下一题</button>}{!FINISHED_STATUSES.includes(game.status) && <button type="button" className="surrender-button" onClick={() => setShowSurrender(true)}>投降并结算</button>}</div>
      <p className="music-guess-note">本地曲库 · 已匹配 {tracks.length} 个 15 秒片段</p>
    </main>
    {showSurrender && <div className="modal-backdrop" role="presentation"><section className="result-dialog music-guess-confirm" role="dialog" aria-modal="true" aria-labelledby="music-guess-confirm-title"><p className="eyebrow">提前结束</p><h2 id="music-guess-confirm-title">现在投降并结算吗？</h2><p>当前歌曲会记为未作答，已经获得的分数会保留。</p><div className="result-actions"><button type="button" className="ghost-button" onClick={() => setShowSurrender(false)}>继续猜</button><button type="button" className="surrender-button" onClick={surrender}>确认投降</button></div></section></div>}
    {FINISHED_STATUSES.includes(game.status) && <GuessResult game={game} total={tracks.length} mode={mode} durationSeconds={durationSeconds} onRestart={restart} onBack={onBack} />}
  </div>;
}
