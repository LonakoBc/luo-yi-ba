import { useCallback, useEffect, useRef, useState } from 'react';
import guessIllustration from '../assets/home-stage/guess-illustration.webp';
import musicGuessIllustration from '../assets/home-stage/music-guess-illustration.png';
import producerIllustration from '../assets/home-stage/producer-illustration.webp';
import multiplayerIllustration from '../assets/home-stage/multiplayer-illustration.webp';
import sortingIllustration from '../assets/home-stage/sorting-illustration.webp';
import crosswordIllustration from '../assets/home-stage/crossword-illustration.webp';
import seniorityIllustration from '../assets/home-stage/seniority-illustration.webp';
import databaseIllustration from '../assets/home-stage/database-illustration.webp';
import './HomeStage.css';

const MODES = [
  { id: 'guess', index: '01', glyph: '♪', title: '曲目猜猜看', kicker: '听见线索，锁定答案', description: '根据曲名、歌姬、STAFF 与年代反馈，找出藏在曲库里的那首歌。', colors: ['#4bc4ff', '#1547b8', '#82efff'], illustration: guessIllustration, mobileArtPosition: '88% 0%' },
  { id: 'multiplayer', index: '02', glyph: '联', title: '多人联机', kicker: '实时合唱 · 默契对决', description: '邀请 2–4 位好友，在同一个房间挑战猜曲、排序与老资历。', colors: ['#4f8fff', '#7f1827', '#ffb1b8'], illustration: multiplayerIllustration, mobileArtPosition: '84% 0%' },
  { id: 'producer', index: '03', glyph: 'P', title: '闪耀的 Producer', kicker: '沿着代表作认出创作者', description: '从投稿年份、代表歌曲和创作线索中，找出熟悉的中 V 音乐人。', colors: ['#f04a5d', '#52163a', '#ffb19f'], illustration: producerIllustration, artScale: 1.06, artShiftX: '-3%', mobileArtPosition: '91% 0%' },
  { id: 'sorting', index: '04', glyph: '序', title: '歌曲大排序', kicker: '重建属于歌曲的时间线', description: '拖动熟悉的作品，让它们回到正确的先后顺序与年代。', colors: ['#238a7d', '#006666', '#b6fff0'], illustration: sortingIllustration, mobileArtPosition: '82% 0%', mobileArtSize: '86%' },
  { id: 'crossword', index: '05', glyph: '字', title: '曲名填字', kicker: '让歌名在交叉处相遇', description: '沿着相交的文字线索，补全一张由中 V 曲名组成的棋盘。', colors: ['#d85bca', '#65308f', '#ffd0f8'], illustration: crosswordIllustration, mobileArtPosition: '72% 0%', mobileArtSize: '90%' },
  { id: 'seniority', index: '06', glyph: '年', title: '谁是老资历？', kicker: '挑战你的中 V 年代感', description: '比较两首歌曲的发布时间，判断谁更早来到这里。', colors: ['#9a79ff', '#332471', '#f0ddff'], illustration: seniorityIllustration, mobileArtPosition: '79% 0%', mobileArtSize: '84%' },
{ id: 'music-guess', index: '07', glyph: '♫', title: '听歌识曲', kicker: '十五秒旋律 · 三条命挑战', description: '从熟悉的旋律中想起记忆中的曲子。', colors: ['#f18ab7', '#8b3d99', '#ffd2e8'], illustration: musicGuessIllustration, mobileArtPosition: '88% 0%' },
  { id: 'database', index: '08', glyph: '库', title: '数据库', kicker: '504 首歌曲与 104 位 P 主', description: '浏览完整资料、筛选曲库，并找到每首作品背后的创作者。', colors: ['#66ccff', '#1547b8', '#bfefff'], illustration: databaseIllustration, mobileArtPosition: '82% 0%', mobileArtSize: '90%' },
];

const STEP_DEGREES = 360 / MODES.length;
const artworkPreloads = new Map();

function preloadArtwork(url) {
  if (!url || artworkPreloads.has(url)) return;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  const ready = typeof image.decode === 'function'
    ? image.decode().catch(() => undefined)
    : Promise.resolve();
  artworkPreloads.set(url, { image, ready });
}

export default function HomeStage({ actions }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);
  const [direction, setDirection] = useState(1);
  const [wheelPosition, setWheelPosition] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const wheelAccumulator = useRef(0);
  const wheelLockedUntil = useRef(0);
  const touchStart = useRef(null);
  const transitionTimer = useRef(null);
  const activeMode = MODES[activeIndex];

  useEffect(() => {
    const adjacentModes = [
      MODES[(activeIndex - 1 + MODES.length) % MODES.length],
      MODES[(activeIndex + 1) % MODES.length],
    ];
    const preloadAdjacent = () => adjacentModes.forEach((mode) => {
      preloadArtwork(mode.illustration);
    });

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadAdjacent, { timeout: 800 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(preloadAdjacent, 120);
    return () => window.clearTimeout(timer);
  }, [activeIndex]);

  const selectMode = useCallback((nextIndex, requestedDirection = null) => {
    const normalized = (nextIndex + MODES.length) % MODES.length;
    if (normalized === activeIndex) return;
    const directDistance = normalized - activeIndex;
    const shortestDistance = Math.abs(directDistance) <= MODES.length / 2
      ? directDistance
      : directDistance > 0 ? directDistance - MODES.length : directDistance + MODES.length;
    const wheelDistance = requestedDirection ?? shortestDistance;
    const nextDirection = Math.sign(wheelDistance) || 1;
    setPreviousIndex(activeIndex);
    setDirection(nextDirection);
    setWheelPosition((position) => position + wheelDistance);
    setActiveIndex(normalized);
    window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => setPreviousIndex(null), 720);
  }, [activeIndex]);

  const stepMode = useCallback((step) => selectMode(activeIndex + step, step), [activeIndex, selectMode]);

  useEffect(() => () => window.clearTimeout(transitionTimer.current), []);

  const handleWheel = (event) => {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    const now = performance.now();
    if (now < wheelLockedUntil.current) return;
    wheelAccumulator.current += event.deltaY;
    if (Math.abs(wheelAccumulator.current) < 38) return;
    const step = wheelAccumulator.current > 0 ? 1 : -1;
    wheelAccumulator.current = 0;
    wheelLockedUntil.current = now + 540;
    stepMode(step);
  };

  const handleKeyDown = (event) => {
    if (['ArrowDown', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      stepMode(1);
    } else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      stepMode(-1);
    } else if (event.key === 'Enter') {
      actions[activeMode.id]?.();
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.changedTouches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    stepMode(deltaX < 0 ? 1 : -1);
  };
  const stageStyle = (mode) => ({
    '--stage-primary': mode.colors[0],
    '--stage-deep': mode.colors[1],
    '--stage-glow': mode.colors[2],
    '--stage-illustration': mode.illustration ? `url(${mode.illustration})` : undefined,
    '--stage-art-scale': mode.artScale ?? 1,
    '--stage-art-shift-x': mode.artShiftX ?? '0%',
    '--stage-art-mobile-position': mode.mobileArtPosition ?? 'center top',
    '--stage-art-mobile-size': mode.mobileArtSize ?? '90%',
  });
  const wheelRotation = -wheelPosition * STEP_DEGREES;

  return (
    <main className="home-stage" tabIndex="0" onWheel={handleWheel} onKeyDown={handleKeyDown} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} aria-label="首页玩法轮盘">
      {previousIndex !== null && (
        <div className={`home-stage-scene previous direction-${direction > 0 ? 'next' : 'previous'} ${MODES[previousIndex].illustration ? 'has-illustration' : ''}`} style={stageStyle(MODES[previousIndex])} aria-hidden="true">
          <div className="home-stage-art" />
        </div>
      )}
      <div key={activeMode.id} className={`home-stage-scene current direction-${direction > 0 ? 'next' : 'previous'} ${activeMode.illustration ? 'has-illustration' : ''}`} style={stageStyle(activeMode)} aria-hidden="true">
        <div className="home-stage-art" />
      </div>
      <div className="home-stage-noise" aria-hidden="true" />
      <div className="home-stage-blur" aria-hidden="true" />

      <header className="home-stage-header">
        <div className="home-stage-brand"><span className="brand-mark" aria-hidden="true" /><div><small>自由小游聚合页</small><strong>洛一把</strong></div></div>
        <button type="button" className="home-quick-toggle" aria-expanded={quickOpen} onClick={() => setQuickOpen((open) => !open)}><span aria-hidden="true">▦</span> 快速入口</button>
      </header>

      <section className="home-stage-copy" aria-live="polite">
        <p><span aria-hidden="true">⌁</span> {activeMode.index} MODE <span aria-hidden="true">⌁</span></p>
        <h1>{activeMode.title}</h1>
        <strong>{activeMode.kicker}</strong>
        <small>{activeMode.description}</small>
        <div className="home-stage-actions">
          <button type="button" className="home-stage-enter" onClick={() => actions[activeMode.id]?.()}>进入当前玩法 <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <section className="home-disc-wrap" aria-label="玩法唱片">
        <div className="home-disc" style={{ transform: `rotate(${wheelRotation}deg)` }} aria-hidden="true">
          <div className="home-disc-grooves" /><div className="home-disc-shine" /><div className="home-disc-label"><span>LUO</span><b>一把</b><small>PLAY · LIST</small></div>
          {MODES.map((mode, index) => {
            const angle = index * STEP_DEGREES;
            const counterRotation = -(angle + wheelRotation);
            return <span key={mode.id} className={`home-disc-node ${index === activeIndex ? 'active' : ''}`} style={{ transform: `rotate(${angle}deg) translateX(var(--disc-node-radius))` }}><i style={{ transform: `translate(-50%, -50%) rotate(${counterRotation}deg)` }}>{mode.glyph}</i></span>;
          })}
        </div>
        <div className="home-disc-controls">
          <button type="button" onClick={() => stepMode(-1)} aria-label="上一个玩法">↑</button>
          <button type="button" onClick={() => stepMode(1)} aria-label="下一个玩法">↓</button>
        </div>
      </section>

      <nav className="home-mode-rail" aria-label="唱片玩法选项">
        {MODES.map((mode, index) => (
          <button key={mode.id} type="button" className={index === activeIndex ? 'active' : ''} onClick={() => selectMode(index)} aria-label={`选择第 ${index + 1} 个玩法`}>
            <span>{mode.index}</span><b aria-hidden="true">{mode.glyph}</b><em aria-hidden="true">{mode.title}</em>
          </button>
        ))}
      </nav>

      <aside className={`home-quick-panel ${quickOpen ? 'open' : ''}`} aria-label="旧版快速切换入口" aria-hidden={!quickOpen}>
        <div className="content-grid">
          {MODES.map((mode) => (
            <button key={mode.id} type="button" className={`content-card available ${mode.id}-card`} onClick={() => actions[mode.id]?.()}>
              {mode.id !== 'database' && <span className="card-index">{mode.index}</span>}
              <span className="music-glyph" aria-hidden="true">{mode.glyph}</span>
              <span className="card-copy"><strong>{mode.title}</strong><small>{mode.description}</small></span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="home-stage-hint" aria-hidden="true">滚轮 / 方向键切换玩法</div>
    </main>
  );
}
