import { useEffect, useState } from 'react';
import songData from './data/songs.generated.json';
import presetData from './data/presets.generated.json';
import databaseData from './data/database.generated.json';
import producerData from './data/producers.generated.json';
import CrosswordPage from './components/CrosswordPage';
import CrosswordLibraryPage from './components/CrosswordLibraryPage';
import DatabaseSingerPage from './components/DatabaseSingerPage';
import GamePage from './components/GamePage';
import GlobalBgm from './components/GlobalBgm';
import LibraryPage from './components/LibraryPage';
import MultiplayerPage from './components/MultiplayerPage';
import ProducerGamePage from './components/ProducerGamePage';
import ProducerDatabasePage from './components/ProducerDatabasePage';
import ProducerModePage from './components/ProducerModePage';
import SeniorityPage from './components/SeniorityPage';
import SeniorityModePage from './components/SeniorityModePage';
import SortingPage from './components/SortingPage';
import SongDatabasePage from './components/SongDatabasePage';
import { filterSongs, filtersFromSearch, filtersToSearch, songsForPreset } from './services/libraryService';

function routeFromLocation(pathname, search = '') {
  if (pathname === '/producer') return { page: 'producer-select', routeKey: pathname };
  const producerMatch = pathname.match(/^\/producer\/play\/(famous|all)$/u);
  if (producerMatch) return { page: 'producer-game', producerMode: producerMatch[1], routeKey: pathname };
  if (pathname === '/multiplayer') return { page: 'multiplayer', view: 'entry', code: new URLSearchParams(search).get('code') };
  if (pathname === '/multiplayer/create') return { page: 'multiplayer', view: 'create' };
  if (pathname === '/multiplayer/join') return { page: 'multiplayer', view: 'entry', code: new URLSearchParams(search).get('code') };
  const multiplayerRoomMatch = pathname.match(/^\/multiplayer\/room\/([A-HJ-NP-Z2-9]{6})$/u);
  if (multiplayerRoomMatch) return { page: 'multiplayer', view: 'room', code: multiplayerRoomMatch[1], routeKey: pathname };
  if (pathname === '/modes') return { page: 'modes', mode: null };
  if (pathname === '/crossword') return { page: 'crossword-select', routeKey: pathname };
  const crosswordPresetMatch = pathname.match(/^\/crossword\/preset\/([a-z0-9-]+)$/u);
  if (crosswordPresetMatch) return { page: 'crossword', presetId: crosswordPresetMatch[1], routeKey: pathname };
  if (pathname === '/sorting') return { page: 'sorting-select', routeKey: pathname };
  const sortingPresetMatch = pathname.match(/^\/sorting\/preset\/([a-z0-9-]+)$/u);
  if (sortingPresetMatch) return { page: 'sorting', kind: 'preset', presetId: sortingPresetMatch[1], routeKey: pathname };
  if (pathname === '/sorting/custom') return { page: 'sorting', kind: 'custom', search, routeKey: `${pathname}${search}` };
  if (pathname === '/seniority') return { page: 'seniority-select', routeKey: pathname };
  const seniorityPresetMatch = pathname.match(/^\/seniority\/preset\/([a-z0-9-]+)$/u);
  if (seniorityPresetMatch) return { page: 'seniority', kind: 'preset', presetId: seniorityPresetMatch[1], search, direction: new URLSearchParams(search).get('mode'), routeKey: `${pathname}${search}` };
  if (pathname === '/seniority/custom') return { page: 'seniority', kind: 'custom', search, direction: new URLSearchParams(search).get('mode'), routeKey: `${pathname}${search}` };
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
      <div><p className="eyebrow">曲目小游戏合集</p><h1>洛一把</h1></div>
    </div>
  );
}

function HomePage({ onChooseGame, onChooseMultiplayer, onChooseProducer, onChooseCrossword, onChooseSeniority, onChooseSorting, onChooseDatabase }) {
  return (
    <div className="page-shell landing-page">
      <header className="landing-header"><Brand /><p>传说曲是对播放量（再生数）超过一百万的作品的称呼，是比殿堂曲（十万播放）的更高荣誉，比此更高的荣誉是神话曲（一千万播放）。</p></header>
      <main className="landing-main">
        <p className="eyebrow">选择游玩内容</p>
        <h2>今天想挑战什么？</h2>
        <div className="content-grid">
          <button type="button" className="content-card available" onClick={onChooseGame}>
            <span className="card-index">01</span><span className="music-glyph" aria-hidden="true">♪</span>
            <span className="card-copy"><strong>曲目猜猜看</strong><small>根据每次猜测获得线索，找出隐藏的经典曲目。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card available multiplayer-card" onClick={onChooseMultiplayer}>
            <span className="card-index">02</span><span className="music-glyph" aria-hidden="true">联</span>
            <span className="card-copy"><strong>多人猜曲（测试中）</strong><small>分享房间码，与 2–4 位好友同步挑战同一首歌曲。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card producer-card available" onClick={onChooseProducer}>
            <span className="card-index">03</span><span className="music-glyph" aria-hidden="true">P</span>
            <span className="card-copy"><strong>闪耀的 Producer</strong><small>从代表曲目与创作线索中认出熟悉的音乐创作者。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card available sorting-card" onClick={onChooseSorting}>
            <span className="card-index">04</span><span className="music-glyph" aria-hidden="true">序</span>
            <span className="card-copy"><strong>歌曲大排序</strong><small>重建歌曲时间线，把熟悉的作品放回正确年代。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card available crossword-card" onClick={onChooseCrossword}>
            <span className="card-index">05</span><span className="music-glyph" aria-hidden="true">字</span>
            <span className="card-copy"><strong>曲名填字</strong><small>让熟悉的歌名在交叉处相遇。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card available seniority-card" onClick={onChooseSeniority}>
            <span className="card-index">06</span><span className="music-glyph" aria-hidden="true">年</span>
            <span className="card-copy"><strong>谁是老资历？</strong><small>比较两首歌曲的发布时间，看看谁更早来到这里。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="content-card available database-card" onClick={onChooseDatabase}>
            <span className="music-glyph" aria-hidden="true">库</span>
            <span className="card-copy"><strong>数据库</strong><small>浏览歌曲与 P 主的完整资料。</small></span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </main>
      <footer>
        参考于<a href="https://anime-character-guessr.netlify.app/" target="_blank" rel="noreferrer noopener">二刺猿笑传之猜猜呗</a>，
        数据来自于<a href="https://vcpedia.cn/" target="_blank" rel="noreferrer noopener">VCPedia</a>，如有错误欢迎联系作者<a href="https://space.bilibili.com/37880274" target="_blank" rel="noreferrer noopener">洛奈lonako</a>，只要有空马上修改！
      </footer>
    </div>
  );
}

export default function App({ songs = songData, presets = presetData, database = databaseData, producers = producerData, random = Math.random, initialPage = null, initialMode = null }) {
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
  const startSeniorityPreset = (presetId) => navigate(`/seniority/preset/${presetId}`);
  const startSeniorityCustom = (filters) => navigate(`/seniority/custom?${filtersToSearch(filters)}`);
  const startSortingPreset = (presetId) => navigate(`/sorting/preset/${presetId}`);
  const startSortingCustom = (filters) => navigate(`/sorting/custom?${filtersToSearch(filters)}`);
  const startCrosswordPreset = (presetId) => navigate(`/crossword/preset/${presetId}`);

  let pageContent;
  if (route.page === 'multiplayer') {
    pageContent = <MultiplayerPage view={route.view} code={route.code} songs={songs} presets={presets} onNavigate={navigate} onBack={() => navigate('/')} />;
  } else if (route.page === 'producer-select') {
    pageContent = <ProducerModePage totalCount={producers.length} famousCount={producers.filter((producer) => producer.famous).length} onChoose={(mode) => navigate(`/producer/play/${mode}`)} onBack={() => navigate('/')} Brand={Brand} />;
  } else if (route.page === 'producer-game') {
    const producerPool = route.producerMode === 'famous' ? producers.filter((producer) => producer.famous) : producers;
    pageContent = <ProducerGamePage key={route.routeKey} producers={producerPool} mode={route.producerMode} random={random} onBack={() => navigate('/producer')} onChangeMode={() => navigate('/producer')} />;
  } else if (route.page === 'modes') {
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
  } else if (route.page === 'crossword-select') {
    const crosswordPresets = ['all', 'henian', 'medium5'].map((id) => presets.find((preset) => preset.id === id)).filter(Boolean);
    pageContent = <CrosswordLibraryPage presets={crosswordPresets} onBack={() => navigate('/')} onStartPreset={startCrosswordPreset} Brand={Brand} />;
  } else if (route.page === 'crossword') {
    const preset = presets.find((item) => item.id === route.presetId);
    const crosswordSongs = songsForPreset(songs, preset);
    pageContent = crosswordSongs.length >= 6
      ? <CrosswordPage key={route.routeKey ?? 'crossword'} songs={crosswordSongs} random={random} onBack={() => navigate('/crossword')} Brand={Brand} backLabel="选择曲库" />
      : <CrosswordLibraryPage presets={['all', 'henian', 'medium5'].map((id) => presets.find((item) => item.id === id)).filter(Boolean)} onBack={() => navigate('/')} onStartPreset={startCrosswordPreset} Brand={Brand} />;
  } else if (route.page === 'sorting-select') {
    pageContent = <LibraryPage songs={songs} presets={presets} onBack={() => navigate('/')} onStartPreset={startSortingPreset} onStartCustom={startSortingCustom} Brand={Brand} eyebrow="歌曲大排序" intro="先确定参与排序的歌曲范围，再选择时间线或年份归位模式。" startLabel="进入排序" minimumSongs={5} />;
  } else if (route.page === 'sorting') {
    const preset = route.kind === 'preset' ? presets.find((item) => item.id === route.presetId) : null;
    const sortingSongs = route.kind === 'custom'
      ? filterSongs(songs, filtersFromSearch(route.search, songs))
      : songsForPreset(songs, preset);
    pageContent = sortingSongs.length >= 5
      ? <SortingPage key={route.routeKey ?? 'sorting'} songs={sortingSongs} random={random} onBack={() => navigate('/sorting')} Brand={Brand} />
      : <LibraryPage songs={songs} presets={presets} onBack={() => navigate('/')} onStartPreset={startSortingPreset} onStartCustom={startSortingCustom} Brand={Brand} eyebrow="歌曲大排序" intro="先确定参与排序的歌曲范围，再选择时间线或年份归位模式。" startLabel="进入排序" minimumSongs={5} />;
  } else if (route.page === 'seniority-select') {
    pageContent = <LibraryPage songs={songs} presets={presets} onBack={() => navigate('/')} onStartPreset={startSeniorityPreset} onStartCustom={startSeniorityCustom} Brand={Brand} eyebrow="发布时间挑战" intro="选择比较范围，再判断其中哪些歌曲更早发布。" startLabel="开始比较" minimumSongs={2} />;
  } else if (route.page === 'seniority') {
    const preset = route.kind === 'preset' ? presets.find((item) => item.id === route.presetId) : null;
    const senioritySongs = route.kind === 'custom'
      ? filterSongs(songs, filtersFromSearch(route.search, songs))
      : songsForPreset(songs, preset);
    const direction = ['older', 'newer'].includes(route.direction) ? route.direction : null;
    const chooseDirection = (nextDirection) => {
      if (route.kind === 'preset') navigate(`/seniority/preset/${route.presetId}?mode=${nextDirection}`);
      else {
        const params = new URLSearchParams(route.search);
        params.set('mode', nextDirection);
        navigate(`/seniority/custom?${params.toString()}`);
      }
    };
    pageContent = senioritySongs.length >= 2 && !direction
      ? <SeniorityModePage poolName={preset?.name ?? '自定义曲库'} songCount={senioritySongs.length} onChoose={chooseDirection} onBack={() => navigate('/seniority')} Brand={Brand} />
      : senioritySongs.length >= 2
        ? <SeniorityPage key={route.routeKey ?? 'seniority'} songs={senioritySongs} direction={direction} random={random} onBack={() => navigate('/seniority')} Brand={Brand} />
      : <LibraryPage songs={songs} presets={presets} onBack={() => navigate('/')} onStartPreset={startSeniorityPreset} onStartCustom={startSeniorityCustom} Brand={Brand} eyebrow="发布时间挑战" intro="选择比较范围，再判断其中哪些歌曲更早发布。" startLabel="开始比较" minimumSongs={2} />;
  } else if (route.page === 'database-select') {
    pageContent = <DatabaseSingerPage catalog={database.catalog} producerCount={producers.length} onSelect={(id) => navigate(`/database/${id}`)} onBack={() => navigate('/')} Brand={Brand} />;
  } else if (route.page === 'database') {
    const singer = database.catalog.find((item) => item.id === route.databaseId);
    const databaseSongs = database.libraries[route.databaseId];
    pageContent = route.databaseId === 'producers'
      ? <ProducerDatabasePage key={route.routeKey} producers={producers} onBack={() => navigate('/database')} onHome={() => navigate('/')} Brand={Brand} />
      : singer && databaseSongs
      ? <SongDatabasePage key={route.routeKey} singer={singer} songs={databaseSongs} onBack={() => navigate('/database')} onHome={() => navigate('/')} Brand={Brand} />
      : <DatabaseSingerPage catalog={database.catalog} producerCount={producers.length} onSelect={(id) => navigate(`/database/${id}`)} onBack={() => navigate('/')} Brand={Brand} />;
  } else {
    pageContent = <HomePage onChooseGame={() => navigate('/modes')} onChooseMultiplayer={() => navigate('/multiplayer')} onChooseProducer={() => navigate('/producer')} onChooseCrossword={() => navigate('/crossword')} onChooseSeniority={() => navigate('/seniority')} onChooseSorting={() => navigate('/sorting')} onChooseDatabase={() => navigate('/database')} />;
  }
  return <><GlobalBgm />{pageContent}</>;
}
