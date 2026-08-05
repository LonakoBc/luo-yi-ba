import { useEffect, useState } from 'react';
import songData from './data/songs.generated.json';
import presetData from './data/presets.generated.json';
import databaseData from './data/database.generated.json';
import CrosswordPage from './components/CrosswordPage';
import DatabaseSingerPage from './components/DatabaseSingerPage';
import GamePage from './components/GamePage';
import GlobalBgm from './components/GlobalBgm';
import LibraryPage from './components/LibraryPage';
import SongDatabasePage from './components/SongDatabasePage';
import { filterSongs, filtersFromSearch, filtersToSearch, songsForPreset } from './services/libraryService';

function routeFromLocation(pathname, search = '') {
  if (pathname === '/modes') return { page: 'modes', mode: null };
  if (pathname === '/crossword') return { page: 'crossword', routeKey: pathname };
  if (pathname === '/database') return { page: 'database-select', routeKey: pathname };
  const databaseMatch = pathname.match(/^\/database\/([a-z0-9-]+)$/u);
  if (databaseMatch) return { page: 'database', databaseId: databaseMatch[1], routeKey: pathname };
  if (pathname === '/play/easy') return { page: 'game', kind: 'preset', presetId: 'intro', routeKey: pathname };
  if (pathname === '/play/hard') return { page: 'game', kind: 'preset', presetId: 'luotianyi', routeKey: pathname };
  const presetMatch = pathname.match(/^\/play\/preset\/([a-z0-9-]+)$/u);
  if (presetMatch) return { page: 'game', kind: 'preset', presetId: presetMatch[1], routeKey: pathname };
  if (pathname === '/play/custom') return { page: 'game', kind: 'custom', search, routeKey: `${pathname}${search}` };
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

function HomePage({ onChooseGame, onChooseCrossword, onChooseDatabase }) {
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
          <button type="button" className="content-card available crossword-card" onClick={onChooseCrossword}>
            <span className="card-index">02</span><span className="music-glyph" aria-hidden="true">字</span>
            <span className="card-copy"><strong>曲名填字</strong><small>让熟悉的歌名在交叉处相遇。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card available database-card" onClick={onChooseDatabase}>
            <span className="card-index">03</span><span className="music-glyph" aria-hidden="true">库</span>
            <span className="card-copy"><strong>歌曲数据库</strong><small>浏览歌姬收录曲目与完整歌曲资料。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </main>
      <footer>
        参考于<a href="https://anime-character-guessr.netlify.app/" target="_blank" rel="noreferrer noopener">二刺猿笑传之猜猜呗</a>，
        数据来自于<a href="https://vcpedia.cn/" target="_blank" rel="noreferrer noopener">VCPedia</a>，如有错误欢迎指出
      </footer>
    </div>
  );
}

export default function App({ songs = songData, presets = presetData, database = databaseData, random = Math.random, initialPage = null, initialMode = null }) {
  const testRoute = initialPage
    ? initialPage === 'game'
      ? { page: 'game', kind: 'preset', presetId: initialMode === 'easy' ? 'intro' : 'luotianyi', routeKey: `test-${initialMode}` }
      : { page: initialPage }
    : null;
  const initialRoute = testRoute ?? routeFromLocation(window.location.pathname, window.location.search);
  const [route, setRoute] = useState(initialRoute);

  useEffect(() => {
    if (initialPage) return undefined;
    const handlePopState = () => setRoute(routeFromLocation(window.location.pathname, window.location.search));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [initialPage]);

  const navigate = (path) => {
    if (!initialPage) window.history.pushState({}, '', path);
    const parsed = routeFromLocation(new URL(path, window.location.origin).pathname, new URL(path, window.location.origin).search);
    setRoute(parsed);
    if (!initialPage) window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const startPreset = (presetId) => navigate(`/play/preset/${presetId}`);
  const startCustom = (filters) => navigate(`/play/custom?${filtersToSearch(filters)}`);

  let pageContent;
  if (route.page === 'modes') {
    pageContent = <LibraryPage songs={songs} presets={presets} onBack={() => navigate('/')} onStartPreset={startPreset} onStartCustom={startCustom} Brand={Brand} />;
  } else if (route.page === 'game') {
    const preset = route.kind === 'preset' ? presets.find((item) => item.id === route.presetId) : null;
    const gameSongs = route.kind === 'custom'
      ? filterSongs(songs, filtersFromSearch(route.search, songs))
      : songsForPreset(songs, preset);
    if (!gameSongs.length) {
      pageContent = <LibraryPage songs={songs} presets={presets} onBack={() => navigate('/')} onStartPreset={startPreset} onStartCustom={startCustom} Brand={Brand} />;
    } else {
      pageContent = <GamePage key={route.routeKey} songs={gameSongs} poolName={preset?.name ?? '自定义曲库'} random={random} onBack={() => navigate('/modes')} />;
    }
  } else if (route.page === 'crossword') {
    pageContent = <CrosswordPage key={route.routeKey ?? 'crossword'} songs={songs} random={random} onBack={() => navigate('/')} Brand={Brand} />;
  } else if (route.page === 'database-select') {
    pageContent = <DatabaseSingerPage catalog={database.catalog} onSelect={(id) => navigate(`/database/${id}`)} onBack={() => navigate('/')} Brand={Brand} />;
  } else if (route.page === 'database') {
    const singer = database.catalog.find((item) => item.id === route.databaseId);
    const databaseSongs = database.libraries[route.databaseId];
    pageContent = singer && databaseSongs
      ? <SongDatabasePage key={route.routeKey} singer={singer} songs={databaseSongs} onBack={() => navigate('/database')} onHome={() => navigate('/')} Brand={Brand} />
      : <DatabaseSingerPage catalog={database.catalog} onSelect={(id) => navigate(`/database/${id}`)} onBack={() => navigate('/')} Brand={Brand} />;
  } else {
    pageContent = <HomePage onChooseGame={() => navigate('/modes')} onChooseCrossword={() => navigate('/crossword')} onChooseDatabase={() => navigate('/database')} />;
  }
  return <><GlobalBgm />{pageContent}</>;
}
