import { useEffect, useMemo, useRef, useState } from 'react';
import GuessInput from './GuessInput';
import MultiplayerSeniorityGame from './MultiplayerSeniorityGame';
import MultiplayerSortingGame from './MultiplayerSortingGame';
import MultiplayerCrosswordGame from './MultiplayerCrosswordGame';
import MultiplayerProducerGame from './MultiplayerProducerGame';
import MultiplayerMusicGuessGame from './MultiplayerMusicGuessGame';
import { MultiplayerEmotePicker, MultiplayerEmotePopups, useMultiplayerEmotePopups } from './MultiplayerEmotes';
import { GuessValue, SONG_FEEDBACK_COLUMNS } from './SongTable';
import { createLocalGameService } from '../services/gameService';
import { createDefaultFilters, filterSongs, getLibraryOptions, songsForPreset } from '../services/libraryService';
import { MUSIC_GUESS_GROUP_PLAYLISTS, MUSIC_GUESS_SINGER_PLAYLISTS, getMusicGuessPlaylist, getMusicGuessPlaylistCount } from '../services/musicGuessService';
import { CROSSWORD_MODE, CROSSWORD_ENTRY_COUNT, CROSSWORD_LIBRARY_PRESET_IDS, GUESS_SONG_MODE, MUSIC_GUESS_MODE, PARTY_MODE, PARTY_MAX_STAGE_COUNT, PARTY_MIN_STAGE_COUNT, PARTY_MODE_OPTIONS, PARTY_STAGE_ROUND_COUNTS, PLAYER_COLORS, PRODUCER_MODE, SENIORITY_MODE, SORTING_MODE, SORTING_SONGS_PER_ROUND, TRIATHLON_MODE, TRIATHLON_TOTAL_ROUNDS, allowedRoundCounts, catalogVersionFor, minimumSongsForMode, partyStageTotalRounds, playerSeatFor, resolvedPlayerColor } from '../services/multiplayerRules';
import { createRoom, joinRoom, loadRoomIdentity, roomSocketUrl, saveRoomIdentity } from '../services/multiplayerClient';
import { appUrl } from '../services/appRouting';

function normalizeCode(value) { return String(value ?? '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/gu, '').slice(0, 6); }
function validNickname(value) { return [...String(value).trim()].length >= 1 && [...String(value).trim()].length <= 12; }

function Toggle({ children, pressed, onClick, disabled = false }) {
  return <button type="button" className="filter-chip" aria-pressed={pressed} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Entrance({ code: initialCode, onCreate, onJoin, onBack }) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('luo-yi-ba-nickname') ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const [copyFeedback, setCopyFeedback] = useState('');
  const copyFeedbackTimer = useRef(null);
  const remember = () => localStorage.setItem('luo-yi-ba-nickname', nickname.trim());
  useEffect(() => () => window.clearTimeout(copyFeedbackTimer.current), []);
  const copyQqGroup = async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText('1087737854');
        copied = true;
      }
    } catch {
      // Fall through to the legacy clipboard path.
    }
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = '1087737854';
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand?.('copy') ?? false;
      } catch {
        copied = false;
      }
      textarea.remove();
    }
    setCopyFeedback(copied ? '已复制群号！' : '复制失败，请手动复制');
    window.clearTimeout(copyFeedbackTimer.current);
    copyFeedbackTimer.current = window.setTimeout(() => setCopyFeedback(''), 1600);
  };
  return <Shell onBack={onBack} title="多人联机" intro="选择玩法创建 2–4 人房间，或使用好友分享的房间码直接加入。">
    <section className="multiplayer-entry-card">
      <label className="multiplayer-label multiplayer-nickname-label">请输入你的昵称：<input aria-label="你的昵称" value={nickname} maxLength={12} autoFocus onChange={(event) => setNickname(event.target.value)} placeholder="1–12 个字符" /></label>
      <div className="multiplayer-entry-columns">
        <div className="multiplayer-entry-column multiplayer-join-column">
          <p className="eyebrow">加入房间：</p>
          <label className="multiplayer-label">6 位房间码<input className="room-code-input" value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} placeholder="ABC234" /></label>
          <button className="primary-button" type="button" disabled={!validNickname(nickname) || code.length !== 6} onClick={() => { remember(); onJoin(nickname.trim(), code); }}>加入房间</button>
          <button type="button" className="multiplayer-qq-card" onClick={copyQqGroup} aria-label="复制联机水友 QQ 群号"><span>想要找到同好？</span><span>欢迎复制加入联机水友Q群！</span></button>
          {copyFeedback && <div className={'multiplayer-copy-feedback ' + (copyFeedback === '已复制群号！' ? 'success' : 'error')} role="status" aria-live="polite">{copyFeedback}</div>}
        </div>
        <div className="multiplayer-entry-column multiplayer-create-column">
          <p className="eyebrow">创建房间：</p>
          <div className="multiplayer-mode-options">
            <button type="button" className="mode-triathlon" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), TRIATHLON_MODE); }}><b>铁人三项</b><small>连续挑战猜曲、排序与老资历，各三轮</small></button>
            <button type="button" className="mode-guess" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), GUESS_SONG_MODE); }}><b>曲目猜猜看</b><small>根据逐字段反馈抢先猜出同一首歌</small></button>
            <button type="button" className="mode-seniority" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), SENIORITY_MODE); }}><b>谁是老资历</b><small>同步比较两首歌曲，选出更早发布者</small></button>
            <button type="button" className="mode-sorting" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), SORTING_MODE); }}><b>歌曲大排序</b><small>同步整理五首歌曲的发布时间线</small></button>
            <button type="button" className="mode-crossword" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), CROSSWORD_MODE); }}><b>曲名填字</b><small>在同一盘曲名棋盘中完成更多曲名</small></button>
            <button type="button" className="mode-producer" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), PRODUCER_MODE); }}><b>猜 P 主</b><small>名 P 模式，共同猜出隐藏的音乐创作者</small></button>
            <button type="button" className="mode-music-guess" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), MUSIC_GUESS_MODE); }}><b>听歌识曲</b><small>播放同一片段，选择正确的歌曲</small></button>
          </div>
        </div>
      </div>
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
  const modeName = mode === SENIORITY_MODE ? '谁是老资历' : mode === SORTING_MODE ? '歌曲大排序' : mode === TRIATHLON_MODE ? '铁人三项' : mode === CROSSWORD_MODE ? '曲名填字' : mode === PRODUCER_MODE ? '猜 P 主' : mode === MUSIC_GUESS_MODE ? '听歌识曲' : '曲目猜猜看';
  const countUnit = mode === SENIORITY_MODE ? '题' : mode === CROSSWORD_MODE ? '盘' : '轮';
  const minimumSongs = [PRODUCER_MODE, MUSIC_GUESS_MODE].includes(mode) ? 0 : mode === CROSSWORD_MODE ? CROSSWORD_ENTRY_COUNT : mode === SENIORITY_MODE ? 2 : mode === SORTING_MODE ? roundCount * SORTING_SONGS_PER_ROUND : mode === TRIATHLON_MODE ? SORTING_SONGS_PER_ROUND : roundCount;
  const sortingDateCounts = mode === SORTING_MODE ? [...selectedSongs.reduce((counts, song) => counts.set(song.releaseMonth, (counts.get(song.releaseMonth) ?? 0) + 1), new Map()).values()] : [];
  const triathlonDateCount = mode === TRIATHLON_MODE ? new Set(selectedSongs.map(({ releaseMonth }) => releaseMonth)).size : 0;
  const eligibleSongCount = mode === SORTING_MODE ? sortingDateCounts.reduce((total, count) => total + Math.min(count, roundCount), 0) : mode === TRIATHLON_MODE ? triathlonDateCount : songCount;
  return <Shell onBack={onBack} title={`创建「${modeName}」房间`} intro={`房主：${nickname}。人数坐满后即可开始。`}>
    <section className="multiplayer-panel room-config">
      <fieldset><legend>房间人数</legend><div className="filter-options">{[2, 3, 4].map((value) => <Toggle key={value} pressed={capacity === value} onClick={() => setPlayers(value)}>{value} 人</Toggle>)}</div></fieldset>
      {mode === TRIATHLON_MODE ? <fieldset><legend>固定赛程</legend><div className="triathlon-schedule-summary"><span>猜曲 × 3</span><b>→</b><span>排序 × 3</span><b>→</b><span>老资历 × 3</span></div></fieldset> : <fieldset><legend>{mode === SENIORITY_MODE ? '题目数量' : mode === CROSSWORD_MODE ? '棋盘数量' : '对局轮数'}</legend><div className="filter-options">{allowedRoundCounts(capacity, mode).map((value) => <Toggle key={value} pressed={roundCount === value} onClick={() => setRoundCount(value)}>{value} {countUnit}</Toggle>)}</div></fieldset>}
      {mode !== PRODUCER_MODE && mode !== MUSIC_GUESS_MODE && <><fieldset><legend>曲库方式</legend><div className="filter-options"><Toggle pressed={kind === 'preset'} onClick={() => setKind('preset')}>快速预设</Toggle><Toggle pressed={kind === 'custom'} onClick={() => setKind('custom')}>自定义筛选</Toggle></div></fieldset>
      {kind === 'preset' ? <label className="multiplayer-label">选择预设<select value={presetId} onChange={(event) => setPresetId(event.target.value)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.titles.length} 首</option>)}</select></label> : <div className="compact-library-filters">
        <fieldset><legend>主要曲库</legend><div className="filter-options">{options.collections.map(({ id, name }) => <Toggle key={id} pressed={filters.collections.includes(id)} onClick={() => toggle('collections', id)}>{name}</Toggle>)}</div></fieldset>
        <fieldset><legend>必须包含歌姬（可选）</legend><div className="filter-options">{options.singers.map((value) => <Toggle key={value} pressed={filters.singers.includes(value)} onClick={() => toggle('singers', value)}>{value}</Toggle>)}</div></fieldset>
        <fieldset><legend>声库</legend><div className="filter-options">{options.voicebanks.map(({ value, label }) => <Toggle key={value} pressed={filters.voicebanks.includes(value)} onClick={() => toggle('voicebanks', value)}>{label}</Toggle>)}</div></fieldset>
        <fieldset><legend>特殊标注</legend><div className="filter-options">{options.specials.map((value) => <Toggle key={value} pressed={filters.specials.includes(value)} onClick={() => toggle('specials', value)}>{value}</Toggle>)}</div></fieldset>
        <div className="year-range"><label>最早<select value={filters.fromYear} onChange={(e) => setFilters((current) => ({ ...current, fromYear: Number(e.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, i) => options.minYear + i).map((year) => <option key={year}>{year}</option>)}</select></label><span>—</span><label>最晚<select value={filters.toYear} onChange={(e) => setFilters((current) => ({ ...current, toYear: Number(e.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, i) => options.minYear + i).map((year) => <option key={year}>{year}</option>)}</select></label></div>
      </div>}</>}
      <div className="create-room-summary"><strong>{modeName} · {capacity} 人 · {mode === TRIATHLON_MODE ? '3 项目 × 3 轮' : `${roundCount} ${countUnit}`}</strong><span>{[PRODUCER_MODE, MUSIC_GUESS_MODE].includes(mode) ? '使用对应的本地资料库' : `${songCount} 首候选曲${mode === SORTING_MODE ? ` · 至少需要 ${minimumSongs} 首` : mode === TRIATHLON_MODE ? ' · 优先整场不重复' : ''}`}</span></div>
      <button type="button" className="primary-button" disabled={busy || eligibleSongCount < minimumSongs} onClick={submit}>{busy ? '正在创建…' : '生成房间码'}</button><p className="multiplayer-error" role="alert">{error}</p>
    </section>
  </Shell>;
}

const MODE_LABELS = Object.freeze({
  [GUESS_SONG_MODE]: '曲目猜猜看',
  [SENIORITY_MODE]: '谁是老资历',
  [SORTING_MODE]: '歌曲大排序',
  [CROSSWORD_MODE]: '曲名填字',
  [PRODUCER_MODE]: '猜 P 主',
  [MUSIC_GUESS_MODE]: '听歌识曲',
});

function LibraryScope({ songs, presets, kind, setKind, presetId, setPresetId, filters, setFilters, forcePreset = false }) {
  const options = useMemo(() => getLibraryOptions(songs), [songs]);
  const toggle = (field, value) => setFilters((current) => ({
    ...current,
    [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value],
  }));
  return <div className="multiplayer-library-scope">
    <fieldset><legend>曲库范围</legend>{forcePreset ? <p className="field-help">曲名填字仅支持：全曲库、禾念系、五维介质系。</p> : <div className="filter-options"><Toggle pressed={kind === 'preset'} onClick={() => setKind('preset')}>预设曲库</Toggle><Toggle pressed={kind === 'custom'} onClick={() => setKind('custom')}>自定义筛选</Toggle></div>}</fieldset>
    {(forcePreset || kind === 'preset') ? <label className="multiplayer-label">选择预设<select value={presetId} onChange={(event) => setPresetId(event.target.value)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.titles.length} 首</option>)}</select></label> : <div className="compact-library-filters">
      <fieldset><legend>主要曲库</legend><div className="filter-options">{options.collections.map(({ id, name }) => <Toggle key={id} pressed={filters.collections.includes(id)} onClick={() => toggle('collections', id)}>{name}</Toggle>)}</div></fieldset>
      <fieldset><legend>必须包含歌姬（可选）</legend><div className="filter-options">{options.singers.map((value) => <Toggle key={value} pressed={filters.singers.includes(value)} onClick={() => toggle('singers', value)}>{value}</Toggle>)}</div></fieldset>
      <fieldset><legend>声库</legend><div className="filter-options">{options.voicebanks.map(({ value, label }) => <Toggle key={value} pressed={filters.voicebanks.includes(value)} onClick={() => toggle('voicebanks', value)}>{label}</Toggle>)}</div></fieldset>
      <fieldset><legend>特殊标注</legend><div className="filter-options">{options.specials.map((value) => <Toggle key={value} pressed={filters.specials.includes(value)} onClick={() => toggle('specials', value)}>{value}</Toggle>)}</div></fieldset>
      <div className="year-range"><label>最早<select value={filters.fromYear} onChange={(event) => setFilters((current) => ({ ...current, fromYear: Number(event.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, index) => options.minYear + index).map((year) => <option key={year}>{year}</option>)}</select></label><span>—</span><label>最晚<select value={filters.toYear} onChange={(event) => setFilters((current) => ({ ...current, toYear: Number(event.target.value) }))}>{Array.from({ length: options.maxYear - options.minYear + 1 }, (_, index) => options.minYear + index).map((year) => <option key={year}>{year}</option>)}</select></label></div>
    </div>}
  </div>;
}

function MusicGuessLibraryScope({ playlistIds, setPlaylistIds, partyScoped = false }) {
  const selectedIds = Array.isArray(playlistIds) && playlistIds.length ? playlistIds : ['all'];
  const selectedPlaylist = getMusicGuessPlaylist(selectedIds.length === 1 ? selectedIds[0] : 'custom', selectedIds);
  const count = getMusicGuessPlaylistCount(selectedPlaylist);
  const presetIds = new Set(MUSIC_GUESS_GROUP_PLAYLISTS.map((playlist) => playlist.id));
  const togglePlaylist = (id) => setPlaylistIds((current) => {
    const currentIds = Array.isArray(current) && current.length ? current : ['all'];
    return currentIds.includes(id)
      ? currentIds.length <= 1 ? currentIds : currentIds.filter((item) => item !== id)
      : [...currentIds, id];
  });
  const toggleSinger = (id) => setPlaylistIds((current) => {
    const currentIds = Array.isArray(current) && current.length ? current : ['all'];
    const next = currentIds.includes(id)
      ? currentIds.filter((item) => item !== id)
      : [...currentIds.filter((item) => !presetIds.has(item)), id];
    return next.length ? next : ['all'];
  });
  const renderPlaylist = (playlist, onClick = () => (partyScoped ? toggleSinger(playlist.id) : togglePlaylist(playlist.id))) => (
    <Toggle key={playlist.id} pressed={selectedIds.includes(playlist.id)} onClick={onClick}>{playlist.title}</Toggle>
  );
  return <div className="multiplayer-library-scope music-guess-library-scope">
    <fieldset><legend>听歌识曲曲库范围</legend><p className="field-help">参考单机模式，可组合本地歌单；每道题所有玩家播放同一个 15 秒片段。</p>
      {partyScoped ? <>
        <div className="music-guess-library-section"><strong>预设曲库（单选）</strong><div className="music-guess-playlist-options">{MUSIC_GUESS_GROUP_PLAYLISTS.map((playlist) => renderPlaylist(playlist, () => setPlaylistIds([playlist.id])))}</div></div>
        <div className="music-guess-library-section"><strong>歌姬曲库（可多选，取并集）</strong><div className="music-guess-playlist-options">{MUSIC_GUESS_SINGER_PLAYLISTS.map((playlist) => renderPlaylist(playlist))}</div></div>
      </> : <div className="music-guess-playlist-options">{[...MUSIC_GUESS_GROUP_PLAYLISTS, ...MUSIC_GUESS_SINGER_PLAYLISTS].map((playlist) => renderPlaylist(playlist))}</div>}
    </fieldset>
    <p className="field-help">当前已匹配约 {count} 个片段 · 至少需要 4 个片段</p>
  </div>;
}

function PartyStageEditor({ stages, setStages }) {
  const stageFor = (mode) => stages.find((stage) => stage.mode === mode);
  const createStage = (mode) => ({
    mode,
    roundCount: 1,
    ...(mode === MUSIC_GUESS_MODE ? { selection: { kind: 'music-playlists', musicPlaylistIds: ['all'] } } : {}),
  });
  const toggleStage = (mode) => setStages((current) => current.some((stage) => stage.mode === mode)
    ? current.length <= PARTY_MIN_STAGE_COUNT ? current : current.filter((stage) => stage.mode !== mode)
    : current.length >= PARTY_MAX_STAGE_COUNT ? current : [...current, createStage(mode)]);
  const moveStage = (mode, direction) => setStages((current) => {
    const index = current.findIndex((stage) => stage.mode === mode);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  const updateStage = (mode, updater) => setStages((current) => current.map((item) => item.mode === mode ? updater(item) : item));
  const partyStageModes = [
    ...PARTY_MODE_OPTIONS.filter((mode) => mode !== CROSSWORD_MODE && mode !== MUSIC_GUESS_MODE),
    ...PARTY_MODE_OPTIONS.filter((mode) => mode === CROSSWORD_MODE || mode === MUSIC_GUESS_MODE),
  ];
  return <div className="party-stage-editor">
    <p className="field-help">至少选择 3 个不同玩法；顺序就是派对赛程，每个玩法最多 3 轮。</p>
    <div className="party-stage-options">{partyStageModes.map((mode) => {
      const stage = stageFor(mode);
      const expandedLibraryStage = mode === MUSIC_GUESS_MODE;
      return <article key={mode} className={'party-stage-option ' + (stage ? 'selected ' : '') + (expandedLibraryStage ? 'party-stage-option-expanded' : '')}>
        <button type="button" className="party-stage-toggle" aria-pressed={Boolean(stage)} onClick={() => toggleStage(mode)}><span className="party-stage-index">{stage ? stages.findIndex((item) => item.mode === mode) + 1 : '+'}</span><strong>{MODE_LABELS[mode]}</strong><small>{stage ? '已加入赛程' : '点击加入'}</small></button>
        {stage && <><div className="party-stage-controls"><div>{PARTY_STAGE_ROUND_COUNTS.map((count) => <Toggle key={count} pressed={stage.roundCount === count} onClick={() => updateStage(mode, (item) => ({ ...item, roundCount: count }))}>{count} 轮</Toggle>)}</div><div><button type="button" className="stage-order-button" onClick={() => moveStage(mode, -1)} disabled={stages.findIndex((item) => item.mode === mode) === 0} aria-label={'上移' + MODE_LABELS[mode]}>↑</button><button type="button" className="stage-order-button" onClick={() => moveStage(mode, 1)} disabled={stages.findIndex((item) => item.mode === mode) === stages.length - 1} aria-label={'下移' + MODE_LABELS[mode]}>↓</button></div></div>
          {mode === CROSSWORD_MODE && <p className="party-stage-library-note">曲名填字跟随主曲库；加入后主曲库仅可选全曲库、禾念系、五维介质系。</p>}
          {mode === MUSIC_GUESS_MODE && <details className="party-stage-library"><summary>独立曲库：听歌识曲</summary><MusicGuessLibraryScope partyScoped playlistIds={stage.selection?.musicPlaylistIds ?? ['all']} setPlaylistIds={(updater) => updateStage(mode, (item) => { const current = item.selection?.musicPlaylistIds ?? ['all']; const next = typeof updater === 'function' ? updater(current) : updater; return { ...item, selection: { kind: 'music-playlists', musicPlaylistIds: next } }; })} /></details>}
        </>}
      </article>;
    })}</div>
    <div className="party-stage-summary"><strong>当前赛程 · {stages.length} 个玩法 · {partyStageTotalRounds(stages)} 轮</strong><span>{stages.map(({ mode, roundCount }) => MODE_LABELS[mode] + ' × ' + roundCount).join(' → ')}</span></div>
  </div>;
}

function NewEntrance({ code: initialCode, onCreate, onJoin, onBack }) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('luo-yi-ba-nickname') ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const [copyFeedback, setCopyFeedback] = useState('');
  const remember = () => localStorage.setItem('luo-yi-ba-nickname', nickname.trim());
  const copyQqGroup = async () => {
    try { await navigator.clipboard?.writeText('1087737854'); setCopyFeedback('已复制群号！'); }
    catch { setCopyFeedback('群号：1087737854'); }
    window.setTimeout(() => setCopyFeedback(''), 1800);
  };
  return <Shell onBack={onBack} title="多人联机" intro="创建一间可自由组合玩法的房间，或加入好友已经创建的对局。">
    <section className="multiplayer-entry-card multiplayer-entry-single-card">
      <label className="multiplayer-label"><span>1. 输入你的昵称</span><input aria-label="你的昵称" value={nickname} maxLength={12} autoFocus onChange={(event) => setNickname(event.target.value)} placeholder="1–12 个字符" /></label>
      <label className="multiplayer-label"><span>2. 填写房间码</span><input className="room-code-input" aria-label="6 位房间码" value={code} onChange={(event) => setCode(normalizeCode(event.target.value))} placeholder="ABC234" /></label>
      <button className="primary-button" type="button" disabled={!validNickname(nickname) || code.length !== 6} onClick={() => { remember(); onJoin(nickname.trim(), code); }}>加入房间</button>
      <div className="entry-divider"><span>还没有房间？</span></div>
      <button className="primary-button multiplayer-create-entry-button" type="button" disabled={!validNickname(nickname)} onClick={() => { remember(); onCreate(nickname.trim(), PARTY_MODE); }}>创建房间</button>
      <button type="button" className="multiplayer-qq-card" onClick={copyQqGroup} aria-label="复制联机水友 QQ 群号"><span>想和更多同好一起玩？</span><span>点击复制联机水友 QQ 群号</span></button>
      {copyFeedback && <div className="multiplayer-copy-feedback success" role="status">{copyFeedback}</div>}
      <section className="multiplayer-scoring-rules" aria-labelledby="multiplayer-scoring-title"><p className="eyebrow" id="multiplayer-scoring-title">SCORING</p><h3>统一结算规则</h3><p>猜曲、猜 P 主、听歌识曲、老资历和排序按表现顺序获得 5 / 3 / 2 / 1 分；曲名填字按完成数量获得 5 / 3 / 2 / 1 分。</p><small>所有玩法的分数都会累计到房间最终排名。</small></section>
    </section>
  </Shell>;
}

function NewCreateRoom({ initialMode = PARTY_MODE, nickname, songs, presets, producers, onCreated, onBack }) {
  const [selectedMode, setSelectedMode] = useState(PARTY_MODE_OPTIONS.includes(initialMode) ? initialMode : PARTY_MODE);
  const [capacity, setCapacity] = useState(2);
  const [roundCount, setRoundCount] = useState(1);
  const [partyStages, setPartyStages] = useState([
    { mode: GUESS_SONG_MODE, roundCount: 1 }, { mode: SENIORITY_MODE, roundCount: 1 }, { mode: SORTING_MODE, roundCount: 1 },
  ]);
  const [kind, setKind] = useState('preset');
  const [presetId, setPresetId] = useState(presets[0]?.id ?? 'all');
  const [filters, setFilters] = useState(() => createDefaultFilters(songs));
  const [musicPlaylistIds, setMusicPlaylistIds] = useState(['all']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const crosswordModeSelected = selectedMode === CROSSWORD_MODE;
  const crosswordInParty = selectedMode === PARTY_MODE && partyStages.some(({ mode }) => mode === CROSSWORD_MODE);
  const crosswordLibraryLocked = crosswordModeSelected || crosswordInParty;
  const availablePresets = useMemo(() => crosswordLibraryLocked ? presets.filter((item) => CROSSWORD_LIBRARY_PRESET_IDS.includes(item.id)) : presets, [crosswordLibraryLocked, presets]);
  const effectiveKind = crosswordLibraryLocked ? 'preset' : kind;
  const effectivePresetId = availablePresets.some((item) => item.id === presetId) ? presetId : availablePresets[0]?.id;
  const preset = availablePresets.find((item) => item.id === effectivePresetId);
  const selectedSongs = useMemo(() => effectiveKind === 'custom' ? filterSongs(songs, filters) : songsForPreset(songs, preset), [effectiveKind, filters, songs, preset]);
  const sharedPartyStages = partyStages.filter(({ mode }) => [GUESS_SONG_MODE, SENIORITY_MODE, SORTING_MODE].includes(mode));
  const modeSongsMinimum = selectedMode === MUSIC_GUESS_MODE ? 4 : selectedMode === PARTY_MODE ? Math.max(...sharedPartyStages.map(({ mode, roundCount: count }) => minimumSongsForMode(mode, count)), 0) : minimumSongsForMode(selectedMode, roundCount);
  const famousProducerCount = producers?.filter((producer) => producer.famous).length ?? 0;
  const selectedMusicPlaylist = getMusicGuessPlaylist(musicPlaylistIds.length === 1 ? musicPlaylistIds[0] : 'custom', musicPlaylistIds);
  const selectedCount = selectedMode === MUSIC_GUESS_MODE ? getMusicGuessPlaylistCount(selectedMusicPlaylist) : selectedMode === PRODUCER_MODE ? famousProducerCount : selectedSongs.length;
  const modeName = selectedMode === PARTY_MODE ? '派对模式' : MODE_LABELS[selectedMode];
  const chooseMode = (nextMode) => { setSelectedMode(nextMode); setRoundCount(allowedRoundCounts(capacity, nextMode)[0] ?? 1); };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const selection = effectiveKind === 'preset' ? { kind: 'preset', presetId: effectivePresetId } : { kind: 'custom', filters };
      if (selectedMode === MUSIC_GUESS_MODE) selection.musicPlaylistIds = musicPlaylistIds;
      const identity = await createRoom({ mode: selectedMode, nickname, capacity, roundCount: selectedMode === PARTY_MODE ? partyStageTotalRounds(partyStages) : roundCount, stages: selectedMode === PARTY_MODE ? partyStages : null, selection }, songs);
      saveRoomIdentity({ ...identity, nickname }); onCreated(identity.code);
    } catch (caught) { setError(caught.message); } finally { setBusy(false); }
  };
  return <Shell onBack={onBack} title="创建多人房间" intro={'房主：' + nickname + '。设置完成后即可创建，开局不必等满员。'}>
    <section className="multiplayer-panel room-config">
      <fieldset><legend>1. 选择玩法</legend><div className="multiplayer-mode-picker">
        <button type="button" className={'party-mode-choice ' + (selectedMode === PARTY_MODE ? 'selected' : '')} onClick={() => chooseMode(PARTY_MODE)}><b>派对模式</b><small>组合至少三个玩法，组成多阶段累计得分赛</small></button>
        <div className="single-mode-grid">{PARTY_MODE_OPTIONS.map((mode) => <button key={mode} type="button" className={selectedMode === mode ? 'selected' : ''} onClick={() => chooseMode(mode)}><b>{MODE_LABELS[mode]}</b><small>{mode === PRODUCER_MODE ? '仅名 P 资料库' : mode === MUSIC_GUESS_MODE ? '共享片段与选项' : '可调整轮次与曲库'}</small></button>)}</div>
      </div></fieldset>
      <fieldset><legend>2. 房间人数</legend><div className="filter-options">{[2, 3, 4].map((value) => <Toggle key={value} pressed={capacity === value} onClick={() => { setCapacity(value); setRoundCount(allowedRoundCounts(value, selectedMode)[0] ?? 1); }}>{value} 人</Toggle>)}</div><p className="field-help">房主可以少人直接开局，人数上限仍为 4 人。</p></fieldset>
      {selectedMode === PARTY_MODE ? <fieldset><legend>3. 派对赛程</legend><PartyStageEditor stages={partyStages} setStages={setPartyStages} /></fieldset> : <fieldset><legend>3. 对局轮数</legend><div className="filter-options">{allowedRoundCounts(capacity, selectedMode).map((value) => <Toggle key={value} pressed={roundCount === value} onClick={() => setRoundCount(value)}>{value} {selectedMode === SENIORITY_MODE ? '题' : selectedMode === CROSSWORD_MODE ? '盘' : '轮'}</Toggle>)}</div></fieldset>}
      {selectedMode === PRODUCER_MODE ? <div className="multiplayer-fixed-database"><strong>猜 P 主资料库</strong><span>特殊标注：仅名 P。房间其他规则仍可调整。</span></div> : selectedMode === MUSIC_GUESS_MODE ? <MusicGuessLibraryScope playlistIds={musicPlaylistIds} setPlaylistIds={setMusicPlaylistIds} /> : <LibraryScope songs={songs} presets={availablePresets} kind={effectiveKind} setKind={setKind} presetId={effectivePresetId} setPresetId={setPresetId} filters={filters} setFilters={setFilters} forcePreset={crosswordLibraryLocked} />}
      <div className="create-room-summary"><strong>{modeName} · {capacity} 人 · {selectedMode === PARTY_MODE ? partyStageTotalRounds(partyStages) + ' 轮' : roundCount + ' ' + (selectedMode === SENIORITY_MODE ? '题' : selectedMode === CROSSWORD_MODE ? '盘' : '轮')}</strong><span>{selectedCount} {selectedMode === MUSIC_GUESS_MODE ? '个可用片段' : selectedMode === PRODUCER_MODE ? '位名 P' : '首候选曲'}{modeSongsMinimum > selectedCount ? ' · 还需要至少 ' + modeSongsMinimum + ' 个' : ''}</span></div>
      <button type="button" className="primary-button" disabled={busy || (selectedMode === PARTY_MODE && partyStages.length < PARTY_MIN_STAGE_COUNT) || selectedCount < modeSongsMinimum} onClick={submit}>{busy ? '正在创建…' : '创建房间'}</button><p className="multiplayer-error" role="alert">{error}</p>
    </section>
  </Shell>;
}

function RoomRuleEditor({ room, songs, presets, onSave }) {
  const [mode, setMode] = useState(room.mode === TRIATHLON_MODE ? PARTY_MODE : room.mode);
  const [capacity, setCapacity] = useState(room.capacity);
  const [roundCount, setRoundCount] = useState(room.roundCount);
  const [stages, setStages] = useState(room.stages?.length ? room.stages : [{ mode: GUESS_SONG_MODE, roundCount: 1 }, { mode: SENIORITY_MODE, roundCount: 1 }, { mode: SORTING_MODE, roundCount: 1 }]);
  const [kind, setKind] = useState(room.selection?.kind ?? 'preset');
  const [presetId, setPresetId] = useState(room.selection?.presetId ?? presets[0]?.id ?? 'all');
  const [filters, setFilters] = useState(() => room.selection?.filters ?? createDefaultFilters(songs));
  const [musicPlaylistIds, setMusicPlaylistIds] = useState(() => room.selection?.musicPlaylistIds?.length ? room.selection.musicPlaylistIds : ['all']);
  const [open, setOpen] = useState(false);
  const chooseMode = (nextMode) => { setMode(nextMode); setRoundCount(allowedRoundCounts(capacity, nextMode)[0] ?? 1); };
  const crosswordModeSelected = mode === CROSSWORD_MODE;
  const crosswordInParty = mode === PARTY_MODE && stages.some(({ mode: stageMode }) => stageMode === CROSSWORD_MODE);
  const crosswordLibraryLocked = crosswordModeSelected || crosswordInParty;
  const availablePresets = useMemo(() => crosswordLibraryLocked ? presets.filter((item) => CROSSWORD_LIBRARY_PRESET_IDS.includes(item.id)) : presets, [crosswordLibraryLocked, presets]);
  const effectiveKind = crosswordLibraryLocked ? 'preset' : kind;
  const effectivePresetId = availablePresets.some((item) => item.id === presetId) ? presetId : availablePresets[0]?.id;
  const selection = effectiveKind === 'preset' ? { kind: 'preset', presetId: effectivePresetId } : { kind: 'custom', filters };
  if (mode === MUSIC_GUESS_MODE) selection.musicPlaylistIds = musicPlaylistIds;
  return <section className="room-rule-editor">
    <div className="room-rule-editor-heading"><div><p className="eyebrow">HOST CONTROLS</p><h3>房间规则</h3><small>房主可在开局前实时修改玩法、轮次和曲库范围。</small></div><button type="button" className="ghost-button" onClick={() => setOpen((value) => !value)}>{open ? '收起设置' : '调整规则'}</button></div>
    {open && <div className="room-rule-editor-body">
      <div className="single-mode-grid"><button type="button" className={mode === PARTY_MODE ? 'selected' : ''} onClick={() => chooseMode(PARTY_MODE)}><b>派对模式</b><small>至少三个玩法</small></button>{PARTY_MODE_OPTIONS.map((item) => <button key={item} type="button" className={mode === item ? 'selected' : ''} onClick={() => chooseMode(item)}><b>{MODE_LABELS[item]}</b><small>单个玩法</small></button>)}</div>
      <div className="filter-options">{[2, 3, 4].map((value) => <Toggle key={value} pressed={capacity === value} disabled={value < room.players.length} onClick={() => { setCapacity(value); setRoundCount(allowedRoundCounts(value, mode)[0] ?? 1); }} >{value} 人</Toggle>)}</div>
      {mode === PARTY_MODE ? <PartyStageEditor stages={stages} setStages={setStages} /> : <div className="filter-options">{allowedRoundCounts(capacity, mode).map((value) => <Toggle key={value} pressed={roundCount === value} onClick={() => setRoundCount(value)}>{value} 轮</Toggle>)}</div>}
      {mode === PRODUCER_MODE ? <div className="multiplayer-fixed-database">特殊标注：仅名 P；使用对应的本地资料库。</div> : mode === MUSIC_GUESS_MODE ? <MusicGuessLibraryScope playlistIds={musicPlaylistIds} setPlaylistIds={setMusicPlaylistIds} /> : <LibraryScope songs={songs} presets={availablePresets} kind={effectiveKind} setKind={setKind} presetId={effectivePresetId} setPresetId={setPresetId} filters={filters} setFilters={setFilters} forcePreset={crosswordLibraryLocked} />}
      <button type="button" className="primary-button" onClick={() => onSave({ mode, capacity, roundCount: mode === PARTY_MODE ? partyStageTotalRounds(stages) : roundCount, stages: mode === PARTY_MODE ? stages : null, selection })}>保存房间规则</button>
    </div>}
  </section>;
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

export function songGuessIds(player) {
  return new Set((player?.guesses ?? []).map((guess) => guess?.song?.id).filter(Boolean));
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
  return <details className="player-color-picker">
    <summary><span><strong id="player-color-picker-title">选择你的玩家颜色</strong><small>当前：{current?.colorName ?? '未选择'} · 点击展开选择</small></span><b>展开</b></summary>
    <div className="player-color-options">{PLAYER_COLORS.map((color) => {
      const occupied = occupiedColors.has(color.color.toUpperCase());
      const selected = current?.id === color.id;
      return <button key={color.id} type="button" disabled={occupied} aria-pressed={selected} onClick={() => onSelect(color.id)} title={occupied ? `${color.colorName}已被占用` : `选择${color.colorName}`}>
        <PlayerColorMarker color={color} /><span>{color.singerName}</span><small>{occupied ? '已占用' : color.colorName}</small>
      </button>;
    })}</div>
  </details>;
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

function Room({ code, songs, presets, producers, onExit }) {
  const identity = useMemo(() => loadRoomIdentity(code), [code]);
  const socketRef = useRef(null);
  const retryRef = useRef(null);
  const clockOffsetRef = useRef(0);
  const deadlineSyncRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(identity ? '' : '这台设备没有该房间的加入凭据');
  const [now, setNow] = useState(Date.now());
  const [dismissedResultRound, setDismissedResultRound] = useState(null);
  const [emotePopups, showEmotePopup] = useMultiplayerEmotePopups();
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
        } else if (message.type === 'emote') showEmotePopup(message);
        else if (message.type === 'error') setError(message.error);
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
  const famousProducers = useMemo(() => (Array.isArray(producers) ? producers.filter((producer) => producer.famous) : []), [producers]);
  const service = useMemo(() => createLocalGameService(roomSongs.length ? roomSongs : songs), [roomSongs, songs]);
  const guessedIds = useMemo(() => songGuessIds(self), [self]);
  const countdown = room?.phase === 'playing' ? room.endsAt - now : room?.phase === 'round-result' ? room.nextRoundAt - now : 0;
  useEffect(() => {
    if (room?.phase !== 'playing' || !room.endsAt || now < room.endsAt + 500) return;
    const deadlineKey = `${room.overallRoundNumber ?? room.roundNumber}:${room.endsAt}`;
    if (deadlineSyncRef.current === deadlineKey) return;
    deadlineSyncRef.current = deadlineKey;
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'sync' }));
  }, [room?.phase, room?.endsAt, room?.roundNumber, room?.overallRoundNumber, now]);
  const copyInvite = async () => { await navigator.clipboard.writeText(appUrl(`/multiplayer/join?code=${code}`)); };
  if (!identity) return <Shell onBack={onExit} title="无法恢复房间" intro={error}><button className="primary-button" type="button" onClick={onExit}>返回联机首页</button></Shell>;
  if (!room) return <Shell onBack={onExit} title="连接房间中" intro={connection === 'reconnecting' ? '连接中断，正在自动重连…' : '正在同步房间状态…'}><p className="multiplayer-error">{error}</p></Shell>;
  const finished = room.phase === 'finished';
  const party = room.mode === PARTY_MODE;
  const triathlon = room.mode === TRIATHLON_MODE;
  const activeMode = room.activeMode ?? room.mode;
  const seniority = activeMode === SENIORITY_MODE;
  const sorting = activeMode === SORTING_MODE;
  const guessSong = activeMode === GUESS_SONG_MODE;
  const crossword = activeMode === CROSSWORD_MODE;
  const producer = activeMode === PRODUCER_MODE;
  const musicGuess = activeMode === MUSIC_GUESS_MODE;
  const modeName = party ? '派对模式' : triathlon ? '铁人三项' : seniority ? '谁是老资历' : sorting ? '歌曲大排序' : crossword ? '曲名填字' : producer ? '猜 P 主' : musicGuess ? '听歌识曲' : '曲目猜猜看';
  const winnerNames = room.ranking?.filter((entry) => entry.rank === 1).map((entry) => entry.nickname).join('、') ?? '';
  const winnerTitle = party ? `恭喜${winnerNames}完成派对挑战！` : triathlon ? `恭喜${winnerNames}获得中V老资历大满贯！` : `恭喜${winnerNames}！${seniority ? '您就是中术老资历！' : sorting ? '您就是中术时间线大师！' : crossword ? '您就是曲名填字大师！' : producer ? '您就是名P识别王！' : musicGuess ? '您就是旋律捕手！' : '您就是中术猜曲王！'}`;
  const resultRoundKey = room.overallRoundNumber ?? room.roundNumber;
  const showRoundResult = room.phase === 'round-result' && dismissedResultRound !== resultRoundKey;
  return <Shell onBack={onExit} title={finished ? '最终排名' : `房间 ${room.code}`} intro={`${modeName} · ${room.poolName} · ${room.players.length}/${room.capacity} 人 · ${party || triathlon ? `第 ${room.overallRoundNumber || 0} / ${room.overallRoundCount || TRIATHLON_TOTAL_ROUNDS} 轮` : `${room.roundCount} ${seniority ? '题' : '轮'}`}`}>
    <div className={`connection-pill ${connection}`}>{connection === 'online' ? '实时连接正常' : '正在重连…'}</div>
    <MultiplayerEmotePopups popups={emotePopups} players={room.players} selfId={self?.id} />
    <MultiplayerEmotePicker disabled={connection !== 'online'} onSend={(emoteId) => send({ type: 'send_emote', emoteId })} />
    {room.phase === 'waiting' ? <section className="multiplayer-panel waiting-room"><div className="room-code"><span>房间码</span><strong>{room.code}</strong></div><div className="room-share-actions"><button type="button" className="ghost-button" onClick={() => navigator.clipboard.writeText(room.code)}>复制房间码</button><button type="button" className="ghost-button" onClick={copyInvite}>复制邀请链接</button></div><div className="waiting-seats">{Array.from({ length: room.capacity }, (_, index) => {
      const player = room.players.find((item) => (item.seat?.index ?? item.seatIndex ?? item.joinOrder) === index);
      const seat = playerSeatFor(index);
      return player
        ? <div key={player.id} className="seat occupied" style={{ '--player-color': playerColorMeta(player)?.color }}><PlayerIdentity player={player} /><small>{seat.number} 号位 · {playerColorMeta(player)?.colorName} · {player.id === room.hostId ? '房主' : '已加入'}</small></div>
        : <div key={index} className="seat empty"><span>等待玩家</span><small>{seat.number} 号位</small></div>;
    })}</div><PlayerColorPicker room={room} self={self} onSelect={(colorId) => send({ type: 'select_color', colorId })} />{self?.id === room.hostId && <RoomRuleEditor room={room} songs={songs} presets={presets} onSave={(config) => send({ type: 'update_room_config', config: { ...config, nickname: self.nickname, catalogVersion: catalogVersionFor(songs) } })} />}{self?.id === room.hostId ? <button className="primary-button" type="button" disabled={!room.players.length} onClick={() => send({ type: 'start_match' })}>开始游戏（当前 {room.players.length} 人）</button> : <p className="waiting-copy">等待房主开始游戏</p>}</section> : null}
    {(party || triathlon) && !['waiting', 'finished'].includes(room.phase) ? <section className="triathlon-match-progress" aria-label={party ? '派对赛程' : '铁人三项赛程'}>
      {(party ? room.stages.map((stage, index) => [stage.mode, MODE_LABELS[stage.mode], index]) : [['guess-song', '猜曲', 0], ['sorting', '排序', 1], ['seniority', '老资历', 2]]).map(([id, label, index]) => {
        const currentStage = party ? room.partyStageIndex === index : activeMode === id;
        const complete = party ? room.partyStageIndex > index : room.overallRoundNumber > (index + 1) * 3;
        return <span key={id} className={currentStage ? 'active' : complete ? 'complete' : ''}><b>{label}</b><small>{party ? `${room.stages[index].roundCount} 轮` : `第 ${index * 3 + 1}–${index * 3 + 3} 轮`}</small></span>;
      })}
    </section> : null}
    {seniority && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerSeniorityGame room={room} self={self} now={now} connection={connection} send={send} /> : null}
    {sorting && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerSortingGame room={room} self={self} now={now} connection={connection} send={send} /> : null}
    {crossword && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerCrosswordGame room={room} self={self} now={now} connection={connection} send={send} /> : null}
    {producer && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerProducerGame room={room} self={self} producers={famousProducers} now={now} connection={connection} send={send} /> : null}
    {musicGuess && ['playing', 'round-result'].includes(room.phase) ? <MultiplayerMusicGuessGame room={room} self={self} now={now} connection={connection} send={send} /> : null}
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

export default function MultiplayerPage({ view, mode = PARTY_MODE, code, songs, presets, producers, onNavigate, onBack }) {
  const [creatorNickname, setCreatorNickname] = useState('');
  const join = async (nickname, roomCode) => {
    try { const identity = await joinRoom(roomCode, nickname); saveRoomIdentity({ ...identity, nickname }); onNavigate(`/multiplayer/room/${roomCode}`); } catch (error) { window.alert(error.message); }
  };
  if (view === 'create') return <NewCreateRoom key={mode} initialMode={mode} nickname={creatorNickname || localStorage.getItem('luo-yi-ba-nickname') || '玩家'} songs={songs} presets={presets} producers={producers} onCreated={(roomCode) => onNavigate(`/multiplayer/room/${roomCode}`)} onBack={() => onNavigate('/multiplayer')} />;
  if (view === 'room') return <Room code={code} songs={songs} presets={presets} producers={producers} onExit={() => onNavigate('/multiplayer')} />;
  return <NewEntrance code={code} onBack={onBack} onCreate={(nickname, nextMode) => { setCreatorNickname(nickname); onNavigate(`/multiplayer/create?mode=${nextMode}`); }} onJoin={join} />;
}
