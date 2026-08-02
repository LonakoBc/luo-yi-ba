import { useEffect, useMemo, useState } from 'react';
import songData from './data/songs.generated.json';
import { selectSimpleSongs } from './data/simpleSongTitles';
import GamePage from './components/GamePage';
import GlobalBgm from './components/GlobalBgm';

function routeFromPath(pathname) {
  if (pathname === '/modes') return { page: 'modes', mode: null };
  if (pathname === '/play/easy') return { page: 'game', mode: 'easy' };
  if (pathname === '/play/hard') return { page: 'game', mode: 'hard' };
  return { page: 'home', mode: null };
}

function Brand({ compact = false }) {
  return (
    <div className={`site-brand ${compact ? 'compact' : ''}`}>
      <div className="brand-mark" aria-hidden="true" />
      <div><p className="eyebrow">传说曲猜猜看</p><h1>洛一把</h1></div>
    </div>
  );
}

function HomePage({ onChooseGame }) {
  return (
    <div className="page-shell landing-page">
      <header className="landing-header"><Brand /><p>传说曲是对播放量（再生数）超过一百万的作品的称呼，是比殿堂曲（十万播放）的更高荣誉，比此更高的荣誉是神话曲（一千万播放）。</p></header>
      <main className="landing-main">
        <p className="eyebrow">选择游玩内容</p>
        <h2>今天想挑战什么？</h2>
        <div className="content-grid">
          <button type="button" className="content-card available" onClick={onChooseGame}>
            <span className="card-index">01</span><span className="music-glyph" aria-hidden="true">♪</span>
            <span className="card-copy"><strong>猜歌</strong><small>根据每次猜测获得线索，找出隐藏的传说曲。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <div className="content-card coming-soon" aria-disabled="true">
            <span className="card-index">02</span><span className="music-glyph" aria-hidden="true">＋</span>
            <span className="card-copy"><strong>更多玩法</strong><small>正在准备中</small></span>
          </div>
        </div>
      </main>
      <footer>
        参考于<a href="https://anime-character-guessr.netlify.app/" target="_blank" rel="noreferrer noopener">二刺猿笑传之猜猜呗</a>，
        数据来自于<a href="https://mzh.moegirl.org.cn/Mainpage#/flow" target="_blank" rel="noreferrer noopener">萌娘百科</a>，如有错误欢迎指出
      </footer>
    </div>
  );
}

function ModePage({ onBack, onChooseMode, totalSongs, simpleCount }) {
  return (
    <div className="page-shell mode-page">
      <header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← 返回主页</button><Brand compact /></header>
      <main className="mode-main">
        <p className="eyebrow">猜歌模式</p><h2>选择你的挑战难度</h2><p className="mode-intro">两种模式使用相同规则，仅候选曲库范围不同。</p>
        <div className="mode-grid">
          <button type="button" className="mode-card easy" onClick={() => onChooseMode('easy')}>
            <span className="mode-number">精选 {simpleCount} 首</span><strong>简单模式</strong>
            <p>精选了更加热门以及出圈的作品，大多是登上了演唱会或生日会。</p><span className="mode-action">开始游玩 →</span>
          </button>
          <button type="button" className="mode-card hard" onClick={() => onChooseMode('hard')}>
            <span className="mode-number">完整 {totalSongs} 首</span><strong>困难模式</strong>
            <p>截止2026年8月1日为止的洛天依全传说曲，数据来源自萌娘百科。</p><span className="mode-action">接受挑战 →</span>
          </button>
        </div>
      </main>
    </div>
  );
}

export default function App({ songs = songData, simpleSongsOverride = null, random = Math.random, initialPage = null, initialMode = null }) {
  const initialRoute = initialPage ? { page: initialPage, mode: initialMode } : routeFromPath(window.location.pathname);
  const [route, setRoute] = useState(initialRoute);
  const simpleSongs = useMemo(() => simpleSongsOverride ?? selectSimpleSongs(songs), [songs, simpleSongsOverride]);

  useEffect(() => {
    if (initialPage) return undefined;
    const handlePopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialPage]);

  const navigate = (page, mode = null) => {
    const path = page === 'home' ? '/' : page === 'modes' ? '/modes' : `/play/${mode}`;
    if (!initialPage) window.history.pushState({}, '', path);
    setRoute({ page, mode });
    if (!initialPage) window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  let pageContent;
  if (route.page === 'modes') {
    pageContent = <ModePage onBack={() => navigate('home')} onChooseMode={(mode) => navigate('game', mode)} totalSongs={songs.length} simpleCount={simpleSongs.length} />;
  } else if (route.page === 'game') {
    const mode = route.mode === 'easy' ? 'easy' : 'hard';
    pageContent = <GamePage key={mode} songs={mode === 'easy' ? simpleSongs : songs} mode={mode} random={random} onBack={() => navigate('modes')} />;
  } else {
    pageContent = <HomePage onChooseGame={() => navigate('modes')} />;
  }
  return <><GlobalBgm />{pageContent}</>;
}
