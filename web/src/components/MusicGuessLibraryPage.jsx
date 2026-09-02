import React, { useMemo, useState } from 'react';
import {
  getMusicGuessPlaylistCount,
  MUSIC_GUESS_GROUP_PLAYLISTS,
  MUSIC_GUESS_SINGER_PLAYLISTS,
  createMusicGuessPlaylist,
} from '../services/musicGuessService';
import { MUSIC_GUESS_CLIP_MANIFEST } from '../data/musicGuessManifest';
import './MusicGuessPage.css';

export default function MusicGuessLibraryPage({ onSelect, onBack, Brand, mode = 'unlimited', durationSeconds = 0, manifest = MUSIC_GUESS_CLIP_MANIFEST }) {
  const [selectedIds, setSelectedIds] = useState(['luotianyi']);
  const selectedPlaylist = useMemo(() => createMusicGuessPlaylist(selectedIds), [selectedIds]);
  const selectedCount = getMusicGuessPlaylistCount(selectedPlaylist, manifest);
  const modeLabel = mode === 'timed' ? ('限时 ' + Math.round(durationSeconds / 60) + ' 分钟') : '不限时';

  const toggleSinger = (id) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  return (
    <div className="page-shell music-guess-page music-guess-library-page">
      <header className="inner-header music-guess-header"><Brand compact /><button type="button" className="back-button" onClick={onBack}>← 选择玩法</button></header>
      <main className="music-guess-library-main">
        <p className="eyebrow">听歌识曲</p>
        <h2>选择猜测歌单</h2>
        <p className="music-guess-intro">当前模式：<strong className="music-guess-selected-mode">{modeLabel}</strong>。从本地曲库选择想挑战的范围，重复音频只会出现一次。</p>

        <section className="music-guess-pool-section" aria-labelledby="music-guess-special-pools">
          <div className="music-guess-section-heading">
            <h3 id="music-guess-special-pools">快捷曲库</h3>
            <span>直接开始</span>
          </div>
          <div className="music-guess-pool-grid">
            {MUSIC_GUESS_GROUP_PLAYLISTS.map((playlist) => (
              <button type="button" className="music-guess-pool-card" key={playlist.id} onClick={() => onSelect([playlist.id])}>
                <span className={'music-guess-pool-icon ' + playlist.iconClass} aria-hidden="true">{playlist.icon}</span>
                <span><strong>{playlist.title}</strong><small>{playlist.description}</small><em>{getMusicGuessPlaylistCount(playlist, manifest)} 首曲目</em>{playlist.id === 'all' && <b>困难！！！</b>}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="music-guess-thanks-card" aria-label="歌单收集致谢">
          <span className="music-guess-thanks-icon" aria-hidden="true">✦</span>
          <p>歌单收集鸣谢：@<strong>若有词</strong>、@<strong>闻灯岚</strong>。</p>
        </aside>

        <section className="music-guess-pool-section" aria-labelledby="music-guess-singer-pools">
          <div className="music-guess-section-heading">
            <h3 id="music-guess-singer-pools">按歌姬选择</h3>
            <span>可多选并集</span>
          </div>
          <div className="music-guess-singer-grid">
            {MUSIC_GUESS_SINGER_PLAYLISTS.map((playlist) => (
              <label className={'music-guess-singer-option' + (selectedIds.includes(playlist.id) ? ' selected' : '')} key={playlist.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(playlist.id)}
                  onChange={() => toggleSinger(playlist.id)}
                />
                <span>{playlist.title}</span>
              </label>
            ))}
          </div>
          <div className="music-guess-custom-action">
            <div>
              <strong>{selectedPlaylist?.title || '请选择至少一个曲库'}</strong>
              <small>{selectedIds.length ? ('已选择 ' + selectedIds.length + ' 个歌姬曲库，共 ' + selectedCount + ' 首曲目，重复歌曲自动合并') : '勾选歌姬后开始挑战'}</small>
            </div>
            <button type="button" className="primary-button" disabled={!selectedPlaylist} onClick={() => onSelect(selectedIds)}>开始挑战</button>
          </div>
        </section>

        <p className="music-guess-local-note">曲目、歌名与 15 秒片段均来自本地曲库。</p>
      </main>
    </div>
  );
}
