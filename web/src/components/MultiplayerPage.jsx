import { useEffect, useMemo, useRef, useState } from 'react';
import GuessInput from './GuessInput';
import MultiplayerSeniorityGame from './MultiplayerSeniorityGame';
import MultiplayerSortingGame from './MultiplayerSortingGame';
import { GuessValue, SONG_FEEDBACK_COLUMNS } from './SongTable';
import { createLocalGameService } from '../services/gameService';
import { createDefaultFilters, filterSongs, getLibraryOptions, songsForPreset } from '../services/libraryService';
import { GUESS_SONG_MODE, PLAYER_COLORS, SENIORITY_MODE, SORTING_MODE, SORTING_SONGS_PER_ROUND, TRIATHLON_MODE, TRIATHLON_TOTAL_ROUNDS, allowedRoundCounts, playerSeatFor, resolvedPlayerColor } from '../services/multiplayerRules';
import { createRoom, joinRoom, loadRoomIdentity, roomSocketUrl, saveRoomIdentity } from '../services/multiplayerClient';

function normalizeCode(value) { return String(value ?? '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/gu, '').slice(0, 6); }
function validNickname(value) { return [...String(value).trim()].length >= 1 && [...String(value).trim()].length <= 12; }

function Toggle({ children, pressed, onClick }) {
  return <button type="button" className="filter-chip" aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

function Entrance({ code: initialCode, onCreate, onJoin, onBack }) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('luo-yi-ba-nickname') ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const remember = () => localStorage.setItem('luo-yi-ba-nickname', nickname.trim());
  return <Shell onBack={onBack} title="多人联机" intro="选择玩法创建 2–4 人房间，或使用好友分享的房间码直接加入。">
    <section className="multiplayer-entry-grid">
      <article className="multiplayer-panel"><p className="eyebrow">创建房间</p><label className="multiplayer-label">你的昵称<input value={nickname} maxLength={12} autoFocus onChange={(event) => setNickname(event.target.value)} placeholder="1–12 个字符" /></label><div className="multiplayer-mode-options"><button type="button" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), GUESS_SONG_MODE); }}><b>曲目猜猜看</b><small>根据逐字段反馈抢先猜出同一首歌</small></button><button type="button" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), SENIORITY_MODE); }}><b>谁是老资历</b><small>同步比较两首歌曲，选出更早发布者</small></button><button type="button" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), SORTING_MODE); }}><b>歌曲大排序</b><small>同步整理五首歌曲的发布时间线</small></button><button type="button" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), TRIATHLON_MODE); }}><b>铁人三项</b><small>连续挑战猜曲、排序与老资历，各三轮</small></button></div></article>
      <article className="multiplayer-panel"><p className="eyebrow">加入好友</p><label className="multiplayer-label">6 位房间码<input className="room-code-input" value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} placeholder="ABC234" /></label><button className="primary-button" type="button" disabled={!validNickname(nickname) || code.length !== 6} onClick={() => { remember(); onJoin(nickname.trim(), code); }}>加入房间</button></article>
    </section>
  </Shell>;
}

function CreateRoom({ mode, nickname, songs, presets, onCreated, onBack }) {
  const [capacity, setCapacity] = useState(2);
  const [roundCount, setRoundCount] = useState(() => allowedRoundCounts(2, mode)[0]);
  const [kind, setKind] = useState('preset');
  const [presetId, setPresetId] = useState(presets[0]?.id ?? 'all');
  const [filters, setFilters] = useState(() => createDefaultFilters(songs));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(() => getLibraryOptions(songs), [songs]);
  const customSongs = useMemo(() => filterSongs(songs, filters), [songs, filters]);
  const preset = presets.find((item) => item.id === presetId);
  const selectedSongs = useMemo(() => kind === 'custom' ? customSongs : songsForPreset(songs, preset), [kind, customSongs, songs, preset]);
  const songCount = selectedSongs.length;
  const setPlayers = (value) => { setCapacity(value); setRoundCount(allowedRoundCounts(value, mode)[0]); };
  const toggle = (field, value) => setFilters((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const selection = kind === 'preset' ? { kind, presetId } : { kind, filters };
      const identity = await createRoom({ mode, nickname, capacity, roundCount, selection }, songs);
      saveRoomIdentity({ ...identity, nickname }); onCreated(identity.code);
    } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  };
  const modeName = mode === SENIORITY_MODE ? '谁是老资历' : mode === SORTING_MODE ? '歌曲大排序' : mode === TRIATHLON_MODE ? '铁人三项' : '曲目猜猜看';
  const countUnit = mode === SENIORITY_MODE ? '题' : '轮';
  const minimumSongs = mode === SENIORITY_MODE ? 2 : mode === SORTING_MODE ? roundCount * SORTING_SONGS_PER_ROUND : mode === TRIATHLON_MODE ? SORTING_SONGS_PER_ROUND : roundCount;
  const sortingDateCounts = mode === SORTING_MODE ? [...selectedSongs.reduce((counts, song) => counts.set(song.releaseMonth, (counts.get(song.releaseMonth) ?? 0) + 1), new Map()).values()] : [];
  const triathlonDateCount = mode === TRIATHLON_MODE ? new Set(selectedSongs.map(({ releaseMonth }) => releaseMonth)).size : 0;
  const eligibleSongCount = mode === SORTING_MODE ? sortingDateCounts.reduce((total, count) => total + Math.min(count, roundCount), 0) : mode === TRIATHLON_MODE ? triathlonDateCount : songCount;
  return <Shell onBack={onBack} title={`创建「${modeName}」房间`} intro={`房主：${nickname}。人数坐满后即可开始。`}>
    <section className="multiplayer-panel room-config">
      <fieldset><legend>房间人数</legend><div className="filter-options">{[2, 3, 4].map((value) => <Toggle key={value} pressed={capacity === value} onClick={() => setPlayers(value)}>{value} 人</Toggle>)}</div></fieldset>
      {mode === TRIATHLON_MODE ? <fieldset><legend>固定赛程</legend><div className="triathlon-schedule-summary"><span>猜曲 × 3</span><b>→</b><span>排序 × 3</span><b>→</b><span>老资历 × 3</span></div></fieldset> : <fieldset><legend>{mode === SENIORITY_MODE ? '题目数量' : '对局轮数'}</legend><div className="filter-options">{allowedRoundCounts(capacity, mode).map((value) => <Toggle key={value} pressed={roundCount === value} onClick={() => setRoundCount(value)}>{value} {countUnit}</Toggle>)}</div></fieldset>}
      <fieldset><legend>曲库方式</legend><div className="filter-options"><Toggle pressed={kind === 'preset'} onClick={() => setKind('preset')}>快速预设</Toggle><Toggle pressed={kind === 'custom'} onClick={() => setKind('custom')}>自定义筛选</Toggle></div></fieldset>
      {kind === 'preset' ? <label className="multiplayer-label">选择预设<select value={presetId} onChange={(event) => setPresetId(event.target.value)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.titles.length} 首</option>)}</select></label> : <div className="compact-library-filters">
        <fieldset><legend>主要曲库</legend><div className="filter-options">{options.collections.map(({ id, name }) => <Toggle key={id} pressed={filters.collections.includes(id)} onClick={() => toggle('collections', id)}>{name}</Toggle>)}</div></fieldset>
        <fieldset><legend>必须包含歌姬（可选）</legend><div className="filter-options">{options.singers.map((value) => <Toggle key={value} pressed={filters.singers.includes(value)} onClick={() => toggle('singers', value)}>{value}</Toggle>)}</div></fieldset>
        <fieldset><legend>声库</legend><div className="filter-options">{options.voicebanks.map(({ value, label }) => <Toggle key={value} pressed={filters.voicebanks.includes(value)} onClick={() => toggle('voicebanks', value)}>{label}</Toggle>)}</div></fieldset>
        <fieldset><legend>特殊标注</legend><div className="filter-options">{options.specials.map((value) => <Toggle key={value} pressed={filters.specials.includes(value)} onClick={() => toggle('specials', value)}>{value}</Toggle>)}</div></fieldset>
        <div className="year-range"><label>最早<select value={filters.fromYear} onChange={(e) => setFilters((current) => ({ ...current, fromYear: Number(e.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, i) => options.minYear + i).map((year) => <option key={year}>{year}</option>)}</select></label><span>—</span><label>最晚<select value={filters.toYear} onChange={(e) => setFilters((current) => ({ ...current, toYear: Number(e.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, i) => options.minYear + i).map((year) => <option key={year}>{year}</option>)}</select></label></div>
      </div>}
      <div className="create-room-summary"><strong>{modeName} · {capacity} 人 · {mode === TRIATHLON_MODE ? '3 项目 × 3 轮' : `${roundCount} ${countUnit}`}</strong><span>{songCount} 首候选曲{mode === SORTING_MODE ? ` · 至少需要 ${minimumSongs} 首` : mode === TRIATHLON_MODE ? ' · 优先整场不重复' : ''}</span></div>
      <button type="button" className="primary-button" disabled={busy || eligibleSongCount < minimumSongs} onClick={submit}>{busy ? '正在创建…' : '生成房间码'}</button><p className="multiplayer-error" role="alert">{error}</p>
    </section>
  </Shell>;
}

function Shell({ onBack, title, intro, children }) {
  return <div className="page-shell multiplayer-page"><header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← 返回</button><div className="multiplayer-brand">多人联机</div></header><main className="multiplayer-main"><p className="eyebrow">MULTIPLAYER</p><h2>{title}</h2><p className="mode-intro">{intro}</p>{children}</main></div>;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function serverClockOffset(serverNow, receivedAt = Date.now()) {
  return Number.isFinite(serverNow) ? serverNow - receivedAt : 0;
}

function playerColorMeta(player) {
  return player?.color ?? resolvedPlayerColor(player);
}

export function PlayerColorMarker({ player, color }) {
  const selectedColor = color ?? playerColorMeta(player);
  if (!selectedColor) return null;
  return <i
    className="player-color-marker"
    style={{ '--player-color': selectedColor.color }}
    aria-label={selectedColor.colorName}
    title={`${selectedColor.singerName ?? ''} · ${selectedColor.colorName}`}
  />;
}

function PlayerIdentity({ player, suffix = '' }) {
  return <span className="player-identity"><PlayerColorMarker player={player} /><span>{player.nickname}{suffix}</span></span>;
}

export function PlayerColorPicker({ room, self, onSelect }) {
  const current = playerColorMeta(self);
  const occupiedColors = new Set(room.players
    .filter((player) => player.id !== self?.id)
    .map((player) => playerColorMeta(player)?.color.toUpperCase())
    .filter(Boolean));
  return <section className="player-color-picker" aria-labelledby="player-color-picker-title">
    <div><strong id="player-color-picker-title">选择你的玩家颜色</strong><small>同一房间内颜色不可重复</small></div>
    <div className="player-color-options">{PLAYER_COLORS.map((color) => {
      const occupied = occupiedColors.has(color.color.toUpperCase());
      const selected = current?.id === color.id;
      return <button key={color.id} type="button" disabled={occupied} aria-pressed={selected} onClick={() => onSelect(color.id)} title={occupied ? `${color.colorName}已被占用` : `选择${color.colorName}`}>
        <PlayerColorMarker color={color} /><span>{color.singerName}</span><small>{occupied ? '已占用' : color.colorName}</small>
      </button>;
    })}</div>
  </section>;
}

function opponentFieldState(field, feedback) {
  if (field === 'title') return feedback.isCorrect ? 'exact' : 'neutral';
  if (field !== 'releaseMonth') return feedback[field]?.state ?? 'miss';
  const year = feedback.releaseMonth?.year?.state;
  const month = feedback.releaseMonth?.month?.state;
  if (year === 'exact' && month === 'exact') return 'exact';
  if (year === 'exact' || year === 'near' || month === 'exact') return 'near';
  return 'miss';
}

function OwnGuessRow({ guess }) {
  return <tr className={guess.feedback?.isCorrect ? 'correct' : ''}>{SONG_FEEDBACK_COLUMNS.map(([field, label]) => <td key={field} data-label={label} className={`multiplayer-feedback-cell ${field === 'title' && guess.feedback?.isCorrect ? 'exact' : ''}`}><GuessValue field={field} song={guess.song} feedback={guess.feedback} /></td>)}</tr>;
}

function OpponentGuessRow({ guess }) {
  const feedback = guess.feedback ?? { isCorrect: Boolean(guess.isCorrect) };
  return <tr className={feedback.isCorrect ? 'correct' : ''}>{SONG_FEEDBACK_COLUMNS.map(([field, label]) => {
    const state = opponentFieldState(field, feedback);
    return <td key={field} data-label={label} className={`opponent-feedback-cell ${state}`}><span className="opponent-cell-blur" aria-label={`${label}：${state === 'exact' ? '完全匹配' : ['near', 'partial'].includes(state) ? '部分匹配' : '未匹配'}`} /></td>;
  })}</tr>;
}

export function GuessFeedbackTable({ player, self }) {
  return <div className="player-feedback-scroll"><table className={`player-feedback-table ${self ? 'own' : 'opponent'}`}><thead><tr>{SONG_FEEDBACK_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{player.guesses.map((guess, index) => self ? <OwnGuessRow key={`${guess.song.id}-${index}`} guess={guess} /> : <OpponentGuessRow key={guess.index} guess={guess} />)}</tbody></table></div>;
}

const CONFETTI_EMITTERS = [18, 50, 82];
const CONFETTI = Array.from({ length: 54 }, (_, index) => ({
  id: index,
  left: CONFETTI_EMITTERS[index % CONFETTI_EMITTERS.length] + ((index * 11) % 13) - 6,
  delay: -((index * .17) % 2.8),
  duration: 1.85 + ((index * 7) % 10) / 10,
  drift: ((index * 37) % 261) - 130,
  apexX: ((index * 23) % 121) - 60,
  settleX: (((index * 23) % 121) - 60) * 1.08,
  rise: 390 + (index % 9) * 34,
  fall: 120 + (index % 5) * 24,
  rotation: 360 + (index % 7) * 110,
  width: 7 + (index % 4) * 2,
  height: 11 + (index % 5) * 3,
  color: ['#66ccff', '#62ce8f', '#ffe069', '#ff7da8', '#9b86f4', '#ff9f43'][index % 6],
}));

export function CelebrationConfetti() {
  return <div className="celebration-confetti" aria-hidden="true">{CONFETTI.map((piece) => <i key={piece.id} style={{ '--confetti-left': `${piece.left}%`, '--confetti-delay': `${piece.delay}s`, '--confetti-duration': `${piece.duration}s`, '--confetti-drift': `${piece.drift}px`, '--confetti-apex-x': `${piece.apexX}px`, '--confetti-settle-x': `${piece.settleX}px`, '--confetti-rise': `${piece.rise}px`, '--confetti-fall': `${piece.fall}px`, '--confetti-apex-rotation': `${piece.rotation * .42}deg`, '--confetti-rotation': `${piece.rotation}deg`, '--confetti-width': `${piece.width}px`, '--confetti-height': `${piece.height}px`, '--confetti-color': piece.color }} />)}</div>;
}

export function MultiplayerRoundResultDialog({ answer, players, nextRoundAt, now, nextLabel = '下一轮', onClose }) {
  const ranking = [...players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder);
  return <div className="dialog-backdrop multiplayer-result-backdrop" role="presentation"><section className="win-dialog multiplayer-result-dialog" role="dialog" aria-modal="true" aria-labelledby="multiplayer-result-title">
    <button type="button" className="result-dialog-close" aria-label="关闭本轮答案" onClick={onClose}>×</button>
    <div className="celebration-mark" aria-hidden="true">♪</div><p className="eyebrow">本轮结束</p><h2 id="multiplayer-result-title">答案揭晓</h2>
    <p className="answer-name">《{answer.title}》</p>
    <dl className="multiplayer-answer-facts"><div><dt>发布时间</dt><dd>{answer.releaseMonth}</dd></div><div><dt>演唱歌姬</dt><dd>{answer.singersDisplay}</dd></div><div className="staff"><dt>STAFF</dt><dd>{answer.staffDisplay}</dd></div></dl>
    <div className="multiplayer-result-places">{ranking.map((player, index) => <span key={player.id}>{index + 1}. <PlayerIdentity player={player} /> <b>+{player.roundScore}</b></span>)}</div>
    <div className="dialog-actions multiplayer-result-links">{answer.bilibiliUrl && <a className="bilibili-link" href={answer.bilibiliUrl} target="_blank" rel="noreferrer noopener">前往 Bilibili 原视频 ↗</a>}{answer.vcpediaUrl && <a className="vcpedia-link" href={answer.vcpediaUrl} target="_blank" rel="noreferrer noopener">前往 VCPedia.cn 页面 ↗</a>}<button type="button" className="ghost-button" onClick={onClose}>关闭并查看战况</button></div>
    <div className="next-round-countdown"><span>{nextLabel}开始倒计时</span><strong>{formatTime(nextRoundAt - now)}</strong></div>
  </section></div>;
}

export function PlayerCard({ player, self }) {
  const color = playerColorMeta(player);
  return <article className={`player-card ${player.solved ? 'solved' : ''} ${self ? 'self' : ''}`} style={{ '--player-color': color?.color }}>
    <header><div><strong><PlayerIdentity player={player} suffix={self ? '（你）' : ''} /></strong><small>{player.online ? '在线' : '重连中'} · {color?.colorName}</small></div><span>{player.score} 分</span></header>
    <div className="player-round-meta"><span>{player.guesses.length} 次猜测</span><span>{player.roundScore ? `本轮 +${player.roundScore}` : player.solved ? '已猜出' : '作答中'}</span></div>
    <div className="player-guesses">{player.guesses.length ? <GuessFeedbackTable player={player} self={self} /> : <p className="no-player-guesses">等待第一次猜测</p>}</div>
  </article>;
}

function Room({ code, songs, presets, onExit }) {
  const identity = useMemo(() => loadRoomIdentity(code), [code]);
  const socketRef = useRef(null);
  const retryRef = useRef(null);
  const clockOffsetRef = useRef(0);
  const [room, setRoom] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(identity ? '' : '这台设备没有该房间的加入凭据');
  const [now, setNow] = useState(Date.now());
  const [dismissedResultRound, setDismissedResultRound] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + clockOffsetRef.current), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!identity) return undefined;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setConnection('connecting');
      const socket = new WebSocket(roomSocketUrl(code, identity.resumeToken)); socketRef.current = socket;
      socket.onopen = () => { setConnection('online'); socket.send(JSON.stringify({ type: 'sync' })); };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          const receivedAt = Date.now();
          clockOffsetRef.current = serverClockOffset(message.room?.serverNow, receivedAt);
          setNow(receivedAt + clockOffsetRef.current);
          setRoom(message.room);
        } else if (message.type === 'error') setError(message.error);
      };
      socket.onclose = () => { if (!disposed) { setConnection('reconnecting'); retryRef.current = setTimeout(connect, 1500); } };
      socket.onerror = () => socket.close();
    };
    connect(); return () => { disposed = true; clearTimeout(retryRef.current); socketRef.current?.close(); };
  }, [code, identity]);
  const send = (message) => { setError(''); if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message)); else setError('连接尚未恢复'); };
  const self = room?.players.find((player) => player.id === identity?.playerId);
  const roomSongs = useMemo(() => {
    if (!room?.selection) return songs;
    if (room.selection.kind === 'custom') return filterSongs(songs, room.selection.filters);
    return songsForPreset(songs, presets.find((preset) => preset.id === room.selection.presetId));
  }, [room?.selection, songs, presets]);
  const service = useMemo(() => createLocalGameService(roomSongs.length ? roomSongs : songs), [roomSongs, songs]);
  const guessedIds = useMemo(() => new Set(self?.guesses?.map((guess) => guess.song.id) ?? []), [self]);
  const countdown = room?.phase === 'playing' ? room.endsAt - now : room?.phase === 'round-result' ? room.nextRoundAt - now : 0;
  const copyInvite = async () => { await navigator.clipboard.writeText(`${window.location.origin}/multiplayer/join?code=${code}`); };
  if (!identity) return <Shell onBack={onExit} title="无法恢复房间" intro={error}><button className="primary-button" type="button" onClick={onExit}>返回联机首页</button></Shell>;
  if (!room) return <Shell onBack={onExit} title="连接房间中" intro={connection === 'reconnecting' ? '连接中断，正在自动重连…' : '正在同步房间状态…'}><p className="multiplayer-error">{error}</p></Shell>;
  const finished = room.phase === 'finished';
  const triathlon = room.mode === TRIATHLON_MODE;
  const activeMode = room.activeMode ?? room.mode;
  const seniority = activeMode === SENIORITY_MODE;
  const sorting = activeMode === SORTING_MODE;
  const guessSong = activeMode === GUESS_SONG_MODE;
  const modeName = triathlon ? '铁人三项' : seniority ? '谁是老资历' : sorting ? '歌曲大排序' : '曲目猜猜看';
  const winnerNames = room.ranking?.filter((entry) => entry.rank === 1).map((entry) => entry.nickname).join('、') ?? '';
  const winnerTitle = triathlon ? `恭喜${winnerNames}获得中V老资历大满贯！` : `恭喜${winnerNames}！${seniority ? '您就是中术老资历！' : sorting ? '您就是中术时间线大师！' : '您就是中术猜曲王！'}`;
  const resultRoundKey = room.overallRoundNumber ?? room.roundNumber;
  const showRoundResult = room.phase === 'round-result' && dismissedResultRound !== resultRoundKey;
  return <Shell onBack={onExit} title={finished ? '最终排名' : `房间 ${room.code}`} intro={`${modeName} · ${room.poolName} · ${room.capacity} 人 · ${triathlon ? `第 ${room.overallRoundNumber || 0} / ${TRIATHLON_TOTAL_ROUNDS} 轮` : `${room.roundCount} ${seniority ? '题' : '轮'}`}`}>
    <div className={`connection-pill ${connection}`}>{connection === 'online' ? '实时连接正常' : '正在重连…'}</div>
    {room.phase === 'waiting' ? <section className="multiplayer-panel waiting-room"><div className="room-code"><span>房间码</span><strong>{room.code}</strong></div><div className="room-share-actions"><button type="button" className="ghost-button" onClick={() => navigator.clipboard.writeText(room.code)}>复制房间码</button><button type="button" className="ghost-button" onClick={copyInvite}>复制邀请链接</button></div><div className="waiting-seats">{Array.from({ length: room.capacity }, (_, index) => {
      const player = room.players.find((item) => (item.seat?.index ?? item.seatIndex ?? item.joinOrder) === index);
      const seat = playerSeatFor(index);
      return player
        ? <div key={player.id} className="seat occupied" style={{ '--player-color': playerColorMeta(player)?.color }}><PlayerIdentity player={player} /><small>{seat.number} 号位 · {playerColorMeta(player)?.colorName} · {player.id === room.hostId ? '房主' : '已加入'}</small></div>
        : <div key={index} className="seat empty"><span>等待玩家</span><small>{seat.number} 号位</small></div>;
    })}</div><PlayerColorPicker room={room} self={self} onSelect={(colorId) => send({ type: 'select_color', colorId })} />{self?.id === room.hostId ? <button className="primary-button" type="button" disabled={room.players.length !== room.capacity} onClick={() => send({ type: 'start_match' })}>{room.players.length === room.capacity ? '开始游戏' : `等待坐满（${room.players.length}/${room.capacity}）`}</button> : <p className="waiting-copy">等待房主开始游戏</p>}</section> : null}
    {triathlon && !['waiting', 'finished'].includes(room.phase) ? <section className="triathlon-match-progress" aria-label="铁人三项赛程">
      {[['guess-song', '猜曲', '1–3'], ['sorting', '排序', '4–6'], ['seniority', '老资历', '7–9']].map(([id, label, range]) => <span key={id} className={activeMode === id ? 'active' : room.overallRoundNumber > Number(range.split('–')[1]) ? 'complete' : ''}><b>{label}</b><small>第 {range} 轮</small></span>)}
    </section> : null}
    {seniority && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerSeniorityGame room={room} self={self} now={now} connection={connection} send={send} /> : null}
    {sorting && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerSortingGame room={room} self={self} now={now} connection={connection} send={send} /> : null}
    {guessSong && ['playing', 'round-result'].includes(room.phase) ? <><section className="multiplayer-round-bar"><span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 轮</span><time>{room.phase === 'playing' ? formatTime(countdown) : `${formatTime(countdown)} 后进入${room.nextLabel ?? '下一轮'}`}</time><span>提示 {room.hintLevel} / 3</span></section>
      {room.answer && Object.keys(room.answer).length ? <aside className="multiplayer-hints"><p className="eyebrow">当前线索</p>{room.answer.title && <h3>《{room.answer.title}》</h3>}<div>{room.answer.releaseMonth && <span>发布时间：{room.answer.releaseMonth}</span>}{room.answer.singersDisplay && <span>歌姬：{room.answer.singersDisplay}</span>}{room.answer.staffDisplay && <span>STAFF：{room.answer.staffDisplay}</span>}{room.answer.lyrics && <q>{room.answer.lyrics}</q>}</div></aside> : null}
      {room.phase === 'playing' && <section className="multiplayer-guess"><GuessInput service={service} disabled={self?.solved || connection !== 'online'} guessedIds={guessedIds} onGuess={(song, raw) => { const resolved = song ?? service.resolveSong(raw); if (resolved) send({ type: 'submit_guess', songId: resolved.id }); else setError('请从联想列表中选择歌曲'); }} /></section>}
      {room.phase === 'round-result' && <section className="round-result-strip"><strong>本轮排名</strong>{[...room.players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder).map((player, index) => <span key={player.id}>{index + 1}. <PlayerIdentity player={player} /> <b>+{player.roundScore}</b></span>)}</section>}
      <div className={`player-grid players-${room.capacity}`}>{room.players.map((player) => <PlayerCard key={player.id} player={player} self={player.id === self?.id} />)}</div>
    </> : null}
    {finished && <section className="multiplayer-panel final-ranking"><CelebrationConfetti /><div className="final-ranking-content"><p className="eyebrow">MATCH COMPLETE</p><h3>{winnerTitle}</h3><ol>{room.ranking.map((entry) => <li key={entry.id} className={`${entry.id === self?.id ? 'self' : ''} ${entry.rank === 1 ? 'winner' : ''}`}><strong>第 {entry.rank} 名</strong><PlayerIdentity player={entry} /><b>{entry.score} 分</b></li>)}</ol><button type="button" className="primary-button" onClick={onExit}>返回联机首页</button></div></section>}
    <p className="multiplayer-error" role="alert">{error}</p>
    {guessSong && showRoundResult && <MultiplayerRoundResultDialog answer={room.answer} players={room.players} nextRoundAt={room.nextRoundAt} now={now} nextLabel={room.nextLabel} onClose={() => setDismissedResultRound(resultRoundKey)} />}
  </Shell>;
}

export default function MultiplayerPage({ view, mode = GUESS_SONG_MODE, code, songs, presets, onNavigate, onBack }) {
  const [creatorNickname, setCreatorNickname] = useState('');
  const join = async (nickname, roomCode) => {
    try { const identity = await joinRoom(roomCode, nickname); saveRoomIdentity({ ...identity, nickname }); onNavigate(`/multiplayer/room/${roomCode}`); } catch (error) { window.alert(error.message); }
  };
  if (view === 'create') return <CreateRoom key={mode} mode={mode} nickname={creatorNickname || localStorage.getItem('luo-yi-ba-nickname') || '玩家'} songs={songs} presets={presets} onCreated={(roomCode) => onNavigate(`/multiplayer/room/${roomCode}`)} onBack={() => onNavigate('/multiplayer')} />;
  if (view === 'room') return <Room code={code} songs={songs} presets={presets} onExit={() => onNavigate('/multiplayer')} />;
  return <Entrance code={code} onBack={onBack} onCreate={(nickname, nextMode) => { setCreatorNickname(nickname); onNavigate(`/multiplayer/create?mode=${nextMode}`); }} onJoin={join} />;
}
