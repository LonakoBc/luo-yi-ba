import { useMemo, useState } from 'react';
import GuessInput from './GuessInput';
import ResultDialog from './ResultDialog';
import SongTable from './SongTable';
import { createLocalGameService } from '../services/gameService';

// 如需彻底隐藏开发者入口，将此处改为 false；生产构建默认不会显示。
const SHOW_DEVELOPER_TOOLS = import.meta.env.DEV;

const HINT_LABELS = ['提示 1/3：歌姬与发布时间', '提示 2/3：揭示 STAFF', '提示 3/3：揭示歌词', '提示已全部使用'];

function DeveloperTools({ service, onForceAnswer }) {
  const [open, setOpen] = useState(false);
  const [songId, setSongId] = useState(service.songs[0]?.id ?? '');
  return (
    <aside className="developer-tools">
      <button type="button" className="developer-toggle" onClick={() => setOpen((value) => !value)}>开发者</button>
      {open && (
        <div className="developer-panel">
          <label htmlFor="developer-answer">指定本模式下一题答案</label>
          <select id="developer-answer" value={songId} onChange={(event) => setSongId(event.target.value)}>
            {service.songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
          </select>
          <button type="button" onClick={() => { onForceAnswer(songId); setOpen(false); }}>设为答案并重开</button>
        </div>
      )}
    </aside>
  );
}

export default function GamePage({ songs, poolName, random, onBack }) {
  const service = useMemo(() => createLocalGameService(songs, { random }), [songs, random]);
  const [game, setGame] = useState(() => service.startGame());
  const [notice, setNotice] = useState('');
  const [showResultDialog, setShowResultDialog] = useState(false);
  const guessedIds = useMemo(() => new Set(game.guesses.map((entry) => entry.song.id)), [game.guesses]);
  const finished = game.status !== 'playing';

  const handleGuess = (song, rawQuery = '') => {
    if (!song) {
      const resolved = service.resolveSong(rawQuery);
      setNotice(resolved && guessedIds.has(resolved.id) ? '这首歌已经猜过了' : '请从联想列表中选择，或输入能唯一匹配的曲名');
      return;
    }
    const result = service.submitGuess(game, song.id);
    if (result.error) return setNotice(result.error);
    setGame(result.game);
    const lyricsAutoRevealed = result.game.status === 'playing'
      && result.game.hintLevel === 3
      && game.hintLevel < 3;
    setNotice(result.game.status === 'won'
      ? ''
      : lyricsAutoRevealed ? '现有线索已全部匹配，已自动揭示歌词' : '还不是这首，看看新线索吧');
    if (result.game.status === 'won') setShowResultDialog(true);
  };

  const handleHint = () => {
    const next = service.useHint(game);
    setGame(next);
    setNotice(next.hintLevel === game.hintLevel ? '' : ['已揭示答案歌姬与发布时间', '已揭示答案 STAFF', '已揭示歌词提示'][next.hintLevel - 1]);
  };

  const restart = (forcedAnswerId = null) => {
    setGame(service.startGame(game.answer.id, forcedAnswerId));
    setShowResultDialog(false);
    setNotice(forcedAnswerId ? '已使用开发者指定答案开始新一局' : '新的一局已经开始');
  };

  const surrender = () => {
    setGame(service.surrender(game));
    setShowResultDialog(true);
    setNotice('答案已经揭晓');
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" /><div className="ambient ambient-two" aria-hidden="true" />
      {SHOW_DEVELOPER_TOOLS && <DeveloperTools service={service} onForceAnswer={restart} />}
      <header className="hero">
        <button type="button" className="back-button game-back" onClick={onBack}>← 选择曲库</button>
        <div className="brand-mark" aria-hidden="true" />
        <div><p className="eyebrow">{poolName}</p><h1>洛一把</h1><p className="tagline">一首歌，七类线索。看看你要几次才能找到答案？</p></div>
        <div className="game-stats" aria-label="游戏状态">
          <span><strong>{songs.length}</strong> 首候选</span><span><strong>{game.guesses.length}</strong> 次猜测</span><span><strong>{3 - game.hintLevel}</strong> 次提示</span>
        </div>
      </header>

      <main>
        <section className="control-panel" aria-label="曲目猜猜看操作">
          <GuessInput service={service} disabled={finished} guessedIds={guessedIds} onGuess={handleGuess} />
          <div className="control-actions">
            <button type="button" className="hint-button" onClick={handleHint} disabled={finished || game.hintLevel >= 3}><span aria-hidden="true">✦</span>{HINT_LABELS[game.hintLevel]}</button>
            <button type="button" className="surrender-button" onClick={surrender} disabled={finished}>投降</button>
          </div>
        </section>
        <div className={`notice ${notice ? 'visible' : ''}`} role="status">{notice || '\u00a0'}</div>
        {game.hintLevel >= 3 && <aside className="lyrics-card" aria-label="歌词提示"><span className="quote-mark" aria-hidden="true">“</span><div><p className="eyebrow">歌词提示</p><p>{game.answer.lyrics}</p></div></aside>}
        <SongTable answer={game.answer} guesses={game.guesses} hintLevel={game.hintLevel} finished={finished} />
        {finished && !showResultDialog && <div className="after-win-actions"><button type="button" className="primary-button" onClick={() => setShowResultDialog(true)}>查看本局结果</button><button type="button" className="ghost-button" onClick={() => restart()}>再来一局</button></div>}
      </main>
      <footer>歌曲资料来自 VCPedia</footer>
      {showResultDialog && <ResultDialog answer={game.answer} guessCount={game.guesses.length} outcome={game.status} onClose={() => setShowResultDialog(false)} onRestart={() => restart()} />}
    </div>
  );
}
