import { useMemo, useState } from 'react';
import ProducerTable from './ProducerTable';
import { createProducerGameService } from '../services/producerGameService';

const SHOW_DEVELOPER_TOOLS = import.meta.env.DEV;
const HINT_LABELS = ['提示 1/3：年份、出道曲与代表曲 E', '提示 2/3：数量与代表曲 D', '提示 3/3：代表曲 A/B/C', '提示已全部使用'];

function ProducerSearch({ service, guessedIds, disabled, onGuess }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const suggestions = service.search(query, guessedIds);
  const submit = (producer = null) => {
    const resolved = producer ?? service.resolveProducer(query);
    onGuess(resolved, query);
    if (resolved) { setQuery(''); setOpen(false); }
  };
  return (
    <div className="guess-input-area producer-search">
      <div className="guess-input-wrap">
        <label className="sr-only" htmlFor="producer-guess">输入你猜测的 P 主</label>
        <input id="producer-guess" value={query} disabled={disabled} autoComplete="off" placeholder="输入 P 主名称或别名…" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(suggestions.length === 1 ? suggestions[0] : null); } if (event.key === 'Escape') setOpen(false); }} />
        <button type="button" className="submit-button" disabled={disabled || !query.trim()} onClick={() => submit(suggestions.length === 1 ? suggestions[0] : null)}>提交猜测</button>
      </div>
      {open && query.trim() && <div className="suggestions producer-suggestions">{suggestions.length ? suggestions.map((producer) => <button type="button" key={producer.id} onMouseDown={(event) => event.preventDefault()} onClick={() => submit(producer)}><strong>{producer.name}</strong>{producer.aliases.length > 0 && <small>别名：{producer.aliases.join('、')}</small>}</button>) : <p>没有找到匹配的 P 主</p>}</div>}
    </div>
  );
}

function ProducerResult({ game, modeName, onClose, onRestart, onChangeMode }) {
  const answer = game.answer;
  return <div className="dialog-backdrop" role="presentation"><section className="win-dialog producer-result" role="dialog" aria-modal="true" aria-labelledby="producer-result-title">
    <div className="celebration-mark" aria-hidden="true">P</div><p className="eyebrow">{game.status === 'won' ? '回答正确' : '答案揭晓'}</p><h2 id="producer-result-title">{game.status === 'won' ? '恭喜认出这位 P 主！' : '本局答案是'}</h2>
    <p className="answer-name">{answer.name}</p><p className="win-summary">{modeName} · 猜测 <strong>{game.guesses.length}</strong> 次 · 使用提示 <strong>{game.hintLevel}</strong> 次</p>
    <dl className="producer-result-grid"><div><dt>初投稿</dt><dd>{answer.debutDate}</dd></div><div><dt>出道曲</dt><dd>《{answer.debutSong}》</dd></div><div><dt>殿堂及以上 / 传说 / 神话</dt><dd>{answer.hallCount} / {answer.legendCount} / {answer.mythCount}</dd></div><div><dt>代表曲</dt><dd>{answer.representativeSongs.map((song) => `《${song}》`).join('、')}</dd></div></dl>
    <div className="dialog-actions"><button type="button" className="primary-button" onClick={onRestart}>再来一局</button><button type="button" className="ghost-button" onClick={onClose}>查看结果</button><button type="button" className="ghost-button" onClick={onChangeMode}>更换模式</button></div>
  </section></div>;
}

function ProducerDeveloperTools({ producers, onForce }) {
  const [open, setOpen] = useState(false); const [id, setId] = useState(producers[0]?.id ?? '');
  return <aside className="developer-tools"><button type="button" className="developer-toggle" onClick={() => setOpen(!open)}>开发者</button>{open && <div className="developer-panel"><label htmlFor="producer-answer">指定答案</label><select id="producer-answer" value={id} onChange={(event) => setId(event.target.value)}>{producers.map((producer) => <option key={producer.id} value={producer.id}>{producer.name}</option>)}</select><button type="button" onClick={() => { onForce(id); setOpen(false); }}>设为答案并重开</button></div>}</aside>;
}

export default function ProducerGamePage({ producers, mode, random, onBack, onChangeMode }) {
  const service = useMemo(() => createProducerGameService(producers, { random }), [producers, random]);
  const [game, setGame] = useState(() => service.startGame()); const [notice, setNotice] = useState(''); const [showResult, setShowResult] = useState(false);
  const guessedIds = useMemo(() => new Set(game.guesses.map((entry) => entry.producer.id)), [game.guesses]);
  const finished = game.status !== 'playing'; const modeName = mode === 'famous' ? '名 P 模式' : '全 P 主模式';
  const restart = (forcedId = null) => { setGame(service.startGame(game.answer.id, forcedId)); setNotice(forcedId ? '已指定答案并开始新一局' : '新的一局已经开始'); setShowResult(false); };
  const guess = (producer, rawQuery) => {
    if (!producer) { const duplicate = service.resolveProducer(rawQuery); setNotice(duplicate && guessedIds.has(duplicate.id) ? '这位 P 主已经猜过了' : '请从联想列表选择，或输入唯一匹配的名称'); return; }
    const result = service.submitGuess(game, producer.id); if (result.error) { setNotice(result.error); return; }
    setGame(result.game); setNotice(result.game.status === 'won' ? '' : producer.debutYear === result.game.answer.debutYear ? '初投稿年份相同，已额外揭示答案的年份与出道曲' : '还不是这位 P 主，看看新线索吧');
    if (result.game.status === 'won') setShowResult(true);
  };
  const hint = () => { const next = service.useHint(game); setGame(next); setNotice(['已揭示年份、出道曲与代表曲 E', '已追加揭示三类数量与代表曲 D', '五首代表曲已全部揭示'][next.hintLevel - 1] ?? ''); };
  const surrender = () => { setGame(service.surrender(game)); setShowResult(true); setNotice('答案已经揭晓'); };
  return <div className="app-shell producer-game-page">
    <div className="ambient ambient-one" aria-hidden="true" /><div className="ambient ambient-two" aria-hidden="true" />
    {SHOW_DEVELOPER_TOOLS && <ProducerDeveloperTools producers={producers} onForce={restart} />}
    <header className="hero producer-hero"><button type="button" className="back-button game-back" onClick={onBack}>← 更换模式</button><div className="brand-mark producer-mark" aria-hidden="true">P</div><div><p className="eyebrow">{modeName}</p><h1>闪耀的 Producer</h1><p className="tagline">七类创作线索，找出隐藏的音乐创作者。</p></div><div className="game-stats"><span><strong>{producers.length}</strong> 位候选</span><span><strong>{game.guesses.length}</strong> 次猜测</span><span><strong>{3 - game.hintLevel}</strong> 次提示</span></div></header>
    <main><section className="control-panel"><ProducerSearch service={service} guessedIds={guessedIds} disabled={finished} onGuess={guess} /><div className="control-actions"><button type="button" className="hint-button" onClick={hint} disabled={finished || game.hintLevel >= 3}>✦ {HINT_LABELS[game.hintLevel]}</button><button type="button" className="surrender-button" onClick={surrender} disabled={finished}>投降</button></div></section><div className={`notice ${notice ? 'visible' : ''}`} role="status">{notice || '\u00a0'}</div>
      <div className="legend producer-legend"><span><i className="legend-exact" />完全匹配</span><span><i className="legend-near" />接近</span><span><i className="legend-token" />代表曲重合</span><span>↑↓ 答案更大/更晚或更小/更早</span></div>
      <ProducerTable answer={game.answer} guesses={game.guesses} hintLevel={game.hintLevel} yearDebutRevealed={game.yearDebutRevealed} finished={finished} />
      {finished && !showResult && <div className="after-win-actions"><button type="button" className="primary-button" onClick={() => setShowResult(true)}>查看本局结果</button><button type="button" className="ghost-button" onClick={() => restart()}>再来一局</button></div>}
    </main><footer>数据来自本地 P 主资料表 · 当前为单人试玩版</footer>
    {showResult && <ProducerResult game={game} modeName={modeName} onClose={() => setShowResult(false)} onRestart={() => restart()} onChangeMode={onChangeMode} />}
  </div>;
}
