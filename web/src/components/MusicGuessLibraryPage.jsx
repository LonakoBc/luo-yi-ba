import { MUSIC_GUESS_PLAYLISTS } from '../services/musicGuessService';
import './MusicGuessPage.css';

export default function MusicGuessLibraryPage({ onSelect, onBack, Brand, playlists = MUSIC_GUESS_PLAYLISTS }) {
  return (
    <div className="page-shell music-guess-page music-guess-library-page">
      <header className="inner-header music-guess-header"><Brand compact /><button type="button" className="back-button" onClick={onBack}>← 返回主页</button></header>
      <main className="music-guess-library-main">
        <p className="eyebrow">听歌识曲</p>
        <h2>选择猜测歌单</h2>
        <p className="music-guess-intro">收录了洛天依经典曲目287首。</p>
        <section className="music-guess-playlist-grid" aria-label="可用猜曲歌单">
          {playlists.map((playlist) => (
            <article className="music-guess-playlist-card" key={playlist.id}>
              <div className="music-guess-playlist-art brand-mark" aria-hidden="true" />
              <div className="music-guess-playlist-copy"><h3>{playlist.title}</h3><p>{playlist.description}</p></div>
              <div className="music-guess-playlist-actions"><button type="button" className="primary-button" onClick={() => onSelect(playlist.id)}>选择歌单</button><a className="music-guess-playlist-link" href={playlist.url} target="_blank" rel="noreferrer noopener">网易云歌单（部分） ↗</a></div>
            </article>
          ))}
        </section>
        {!playlists.length && <p className="music-guess-empty">暂时没有可用的联网歌单。</p>}
      </main>
    </div>
  );
}
