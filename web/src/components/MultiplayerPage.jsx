import { useEffect, useMemo, useRef, useState } from 'react';
import GuessInput from './GuessInput';
import { createLocalGameService } from '../services/gameService';
import { createDefaultFilters, filterSongs, getLibraryOptions, songsForPreset } from '../services/libraryService';
import { allowedRoundCounts } from '../services/multiplayerRules';
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
  return <Shell onBack={onBack} title="多人曲目猜猜看" intro="创建一个 2–4 人房间，或使用好友分享的房间码加入。">
    <section className="multiplayer-entry-grid">
      <article className="multiplayer-panel"><p className="eyebrow">玩家身份</p><label className="multiplayer-label">你的昵称<input value={nickname} maxLength={12} autoFocus onChange={(event) => setNickname(event.target.value)} placeholder="1–12 个字符" /></label><button className="primary-button" type="button" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim()); }}>创建房间</button></article>
      <article className="multiplayer-panel"><p className="eyebrow">加入好友</p><label className="multiplayer-label">6 位房间码<input className="room-code-input" value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} placeholder="ABC234" /></label><button className="primary-button" type="button" disabled={!validNickname(nickname) || code.length !== 6} onClick={() => { remember(); onJoin(nickname.trim(), code); }}>加入房间</button></article>
    </section>
  </Shell>;
}

function CreateRoom({ nickname, songs, presets, onCreated, onBack }) {
  const [capacity, setCapacity] = useState(2);
  const [roundCount, setRoundCount] = useState(1);
  const [kind, setKind] = useState('preset');
  const [presetId, setPresetId] = useState(presets[0]?.id ?? 'all');
  const [filters, setFilters] = useState(() => createDefaultFilters(songs));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(() => getLibraryOptions(songs), [songs]);
  const customSongs = useMemo(() => filterSongs(songs, filters), [songs, filters]);
  const preset = presets.find((item) => item.id === presetId);
  const songCount = kind === 'custom' ? customSongs.length : (preset?.songIds?.length ?? preset?.titles.length ?? 0);
  const setPlayers = (value) => { setCapacity(value); setRoundCount(allowedRoundCounts(value)[0]); };
  const toggle = (field, value) => setFilters((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const selection = kind === 'preset' ? { kind, presetId } : { kind, filters };
      const identity = await createRoom({ nickname, capacity, roundCount, selection }, songs);
      saveRoomIdentity({ ...identity, nickname }); onCreated(identity.code);
    } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  };
  return <Shell onBack={onBack} title="创建联机房间" intro={`房主：${nickname}。人数坐满后即可开始。`}>
    <section className="multiplayer-panel room-config">
      <fieldset><legend>房间人数</legend><div className="filter-options">{[2, 3, 4].map((value) => <Toggle key={value} pressed={capacity === value} onClick={() => setPlayers(value)}>{value} 人</Toggle>)}</div></fieldset>
      <fieldset><legend>对局轮数</legend><div className="filter-options">{allowedRoundCounts(capacity).map((value) => <Toggle key={value} pressed={roundCount === value} onClick={() => setRoundCount(value)}>{value} 轮</Toggle>)}</div></fieldset>
      <fieldset><legend>曲库方式</legend><div className="filter-options"><Toggle pressed={kind === 'preset'} onClick={() => setKind('preset')}>快速预设</Toggle><Toggle pressed={kind === 'custom'} onClick={() => setKind('custom')}>自定义筛选</Toggle></div></fieldset>
      {kind === 'preset' ? <label className="multiplayer-label">选择预设<select value={presetId} onChange={(event) => setPresetId(event.target.value)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.titles.length} 首</option>)}</select></label> : <div className="compact-library-filters">
        <fieldset><legend>主要曲库</legend><div className="filter-options">{options.collections.map(({ id, name }) => <Toggle key={id} pressed={filters.collections.includes(id)} onClick={() => toggle('collections', id)}>{name}</Toggle>)}</div></fieldset>
        <fieldset><legend>必须包含歌姬（可选）</legend><div className="filter-options">{options.singers.map((value) => <Toggle key={value} pressed={filters.singers.includes(value)} onClick={() => toggle('singers', value)}>{value}</Toggle>)}</div></fieldset>
        <fieldset><legend>声库</legend><div className="filter-options">{options.voicebanks.map(({ value, label }) => <Toggle key={value} pressed={filters.voicebanks.includes(value)} onClick={() => toggle('voicebanks', value)}>{label}</Toggle>)}</div></fieldset>
        <fieldset><legend>特殊标注</legend><div className="filter-options">{options.specials.map((value) => <Toggle key={value} pressed={filters.specials.includes(value)} onClick={() => toggle('specials', value)}>{value}</Toggle>)}</div></fieldset>
        <div className="year-range"><label>最早<select value={filters.fromYear} onChange={(e) => setFilters((current) => ({ ...current, fromYear: Number(e.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, i) => options.minYear + i).map((year) => <option key={year}>{year}</option>)}</select></label><span>—</span><label>最晚<select value={filters.toYear} onChange={(e) => setFilters((current) => ({ ...current, toYear: Number(e.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, i) => options.minYear + i).map((year) => <option key={year}>{year}</option>)}</select></label></div>
      </div>}
      <div className="create-room-summary"><strong>{capacity} 人 · {roundCount} 轮</strong><span>{songCount} 首候选曲</span></div>
      <button type="button" className="primary-button" disabled={busy || songCount < roundCount} onClick={submit}>{busy ? '正在创建…' : '生成房间码'}</button><p className="multiplayer-error" role="alert">{error}</p>
    </section>
  </Shell>;
}

function Shell({ onBack, title, intro, children }) {
  return <div className="page-shell multiplayer-page"><header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← 返回</button><div className="multiplayer-brand">联机 · 曲目猜猜看</div></header><main className="multiplayer-main"><p className="eyebrow">MULTIPLAYER</p><h2>{title}</h2><p className="mode-intro">{intro}</p>{children}</main></div>;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PlayerCard({ player, self }) {
  return <article className={`player-card ${player.solved ? 'solved' : ''} ${self ? 'self' : ''}`}>
    <header><div><strong>{player.nickname}{self ? '（你）' : ''}</strong><small>{player.online ? '在线' : '重连中'}</small></div><span>{player.score} 分</span></header>
    <div className="player-round-meta"><span>{player.guesses.length} 次猜测</span><span>{player.roundScore ? `本轮 +${player.roundScore}` : player.solved ? '已猜出' : '作答中'}</span></div>
    <div className="player-guesses">{player.guesses.length ? player.guesses.map((guess, index) => self
      ? <div className={`self-guess ${guess.feedback?.isCorrect ? 'correct' : ''}`} key={`${guess.song.id}-${index}`}><strong>{guess.song.title}</strong><span>{guess.feedback?.isCorrect ? '正确' : '查看字段反馈'}</span><div className="feedback-dots">{['staff', 'releaseMonth', 'singers', 'voicebanks', 'concertCount', 'special'].map((key) => <i key={key} className={guess.feedback?.[key]?.state ?? 'miss'} title={key} />)}</div></div>
      : <div className={`opponent-guess ${guess.isCorrect ? 'correct' : ''}`} key={guess.index}><span className="blur-bar" /><small>{guess.isCorrect ? '猜对了' : `第 ${guess.index} 次猜测`}</small></div>) : <p className="no-player-guesses">等待第一次猜测</p>}</div>
  </article>;
}

function Room({ code, songs, presets, onExit }) {
  const identity = useMemo(() => loadRoomIdentity(code), [code]);
  const socketRef = useRef(null);
  const retryRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(identity ? '' : '这台设备没有该房间的加入凭据');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!identity) return undefined;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setConnection('connecting');
      const socket = new WebSocket(roomSocketUrl(code, identity.resumeToken)); socketRef.current = socket;
      socket.onopen = () => { setConnection('online'); socket.send(JSON.stringify({ type: 'sync' })); };
      socket.onmessage = (event) => { const message = JSON.parse(event.data); if (message.type === 'state') setRoom(message.room); else if (message.type === 'error') setError(message.error); };
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
  const guessedIds = useMemo(() => new Set(self?.guesses.map((guess) => guess.song.id) ?? []), [self]);
  const countdown = room?.phase === 'playing' ? room.endsAt - now : room?.phase === 'round-result' ? room.nextRoundAt - now : 0;
  const copyInvite = async () => { await navigator.clipboard.writeText(`${window.location.origin}/multiplayer/join?code=${code}`); };
  if (!identity) return <Shell onBack={onExit} title="无法恢复房间" intro={error}><button className="primary-button" type="button" onClick={onExit}>返回联机首页</button></Shell>;
  if (!room) return <Shell onBack={onExit} title="连接房间中" intro={connection === 'reconnecting' ? '连接中断，正在自动重连…' : '正在同步房间状态…'}><p className="multiplayer-error">{error}</p></Shell>;
  const finished = room.phase === 'finished';
  return <Shell onBack={onExit} title={finished ? '最终排名' : `房间 ${room.code}`} intro={`${room.poolName} · ${room.capacity} 人 · ${room.roundCount} 轮`}>
    <div className={`connection-pill ${connection}`}>{connection === 'online' ? '实时连接正常' : '正在重连…'}</div>
    {room.phase === 'waiting' ? <section className="multiplayer-panel waiting-room"><div className="room-code"><span>房间码</span><strong>{room.code}</strong></div><div className="room-share-actions"><button type="button" className="ghost-button" onClick={() => navigator.clipboard.writeText(room.code)}>复制房间码</button><button type="button" className="ghost-button" onClick={copyInvite}>复制邀请链接</button></div><div className="waiting-seats">{Array.from({ length: room.capacity }, (_, index) => room.players[index] ? <div key={room.players[index].id} className="seat"><span>{room.players[index].nickname}</span><small>{room.players[index].id === room.hostId ? '房主' : '已加入'}</small></div> : <div key={index} className="seat empty"><span>等待玩家</span><small>{index + 1} 号位</small></div>)}</div>{self?.id === room.hostId ? <button className="primary-button" type="button" disabled={room.players.length !== room.capacity} onClick={() => send({ type: 'start_match' })}>{room.players.length === room.capacity ? '开始游戏' : `等待坐满（${room.players.length}/${room.capacity}）`}</button> : <p className="waiting-copy">等待房主开始游戏</p>}</section> : null}
    {['playing', 'round-result'].includes(room.phase) ? <><section className="multiplayer-round-bar"><span>第 <strong>{room.roundNumber}</strong> / {room.roundCount} 轮</span><time>{room.phase === 'playing' ? formatTime(countdown) : `${formatTime(countdown)} 后进入下一轮`}</time><span>提示 {room.hintLevel} / 3</span></section>
      {room.answer && Object.keys(room.answer).length ? <aside className="multiplayer-hints"><p className="eyebrow">当前线索</p>{room.answer.title && <h3>《{room.answer.title}》</h3>}<div>{room.answer.releaseMonth && <span>发布时间：{room.answer.releaseMonth}</span>}{room.answer.singersDisplay && <span>歌姬：{room.answer.singersDisplay}</span>}{room.answer.staffDisplay && <span>STAFF：{room.answer.staffDisplay}</span>}{room.answer.lyrics && <q>{room.answer.lyrics}</q>}</div></aside> : null}
      {room.phase === 'playing' && <section className="multiplayer-guess"><GuessInput service={service} disabled={self?.solved || connection !== 'online'} guessedIds={guessedIds} onGuess={(song, raw) => { const resolved = song ?? service.resolveSong(raw); if (resolved) send({ type: 'submit_guess', songId: resolved.id }); else setError('请从联想列表中选择歌曲'); }} /></section>}
      {room.phase === 'round-result' && <section className="round-result-strip"><strong>本轮排名</strong>{[...room.players].sort((a, b) => b.roundScore - a.roundScore || a.joinOrder - b.joinOrder).map((player, index) => <span key={player.id}>{index + 1}. {player.nickname} <b>+{player.roundScore}</b></span>)}</section>}
      <div className={`player-grid players-${room.capacity}`}>{room.players.map((player) => <PlayerCard key={player.id} player={player} self={player.id === self?.id} />)}</div>
    </> : null}
    {finished && <section className="multiplayer-panel final-ranking"><ol>{room.ranking.map((entry) => <li key={entry.id} className={entry.id === self?.id ? 'self' : ''}><strong>第 {entry.rank} 名</strong><span>{entry.nickname}</span><b>{entry.score} 分</b></li>)}</ol><button type="button" className="primary-button" onClick={onExit}>返回联机首页</button></section>}
    <p className="multiplayer-error" role="alert">{error}</p>
  </Shell>;
}

export default function MultiplayerPage({ view, code, songs, presets, onNavigate, onBack }) {
  const [creatorNickname, setCreatorNickname] = useState('');
  const join = async (nickname, roomCode) => {
    try { const identity = await joinRoom(roomCode, nickname); saveRoomIdentity({ ...identity, nickname }); onNavigate(`/multiplayer/room/${roomCode}`); } catch (error) { window.alert(error.message); }
  };
  if (view === 'create') return <CreateRoom nickname={creatorNickname || localStorage.getItem('luo-yi-ba-nickname') || '玩家'} songs={songs} presets={presets} onCreated={(roomCode) => onNavigate(`/multiplayer/room/${roomCode}`)} onBack={() => onNavigate('/multiplayer')} />;
  if (view === 'room') return <Room code={code} songs={songs} presets={presets} onExit={() => onNavigate('/multiplayer')} />;
  return <Entrance code={code} onBack={onBack} onCreate={(nickname) => { setCreatorNickname(nickname); onNavigate('/multiplayer/create'); }} onJoin={join} />;
}
