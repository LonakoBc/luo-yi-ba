import React from 'react';
import { MUSIC_GUESS_TIME_LIMITS } from '../services/musicGuessService';
import './MusicGuessPage.css';

export default function MusicGuessModePage({ onChoose, onBack, Brand }) {
  return (
    <div className="page-shell music-guess-page music-guess-mode-page">
      <header className="inner-header music-guess-header"><Brand compact /><button type="button" className="back-button" onClick={onBack}>← 返回主页</button></header>
      <main className="music-guess-mode-main">
        <p className="eyebrow">听歌识曲</p>
        <h2>选择挑战模式</h2>
        <p className="music-guess-intro">先决定本局节奏，再选择想挑战的歌单范围。</p>
        <section className="music-guess-mode-grid" aria-label="听歌识曲挑战模式">
          <article className="music-guess-mode-card timed">
            <div className="music-guess-mode-icon" aria-hidden="true">⏱</div>
            <div className="music-guess-mode-copy">
              <p className="eyebrow">LIMITED TIME</p>
              <h3>限时模式</h3>
              <p>在倒计时内尽可能猜出更多歌曲，依旧保留三条命；结算时会根据剩余生命获得额外奖励。</p>
            </div>
            <div className="music-guess-duration-options" aria-label="选择限时时长">
              {MUSIC_GUESS_TIME_LIMITS.map((seconds) => (
                <button type="button" key={seconds} aria-label={`选择限时${Math.round(seconds / 60)}分钟`} onClick={() => onChoose({ mode: 'timed', durationSeconds: seconds })}>
                  <strong>{Math.round(seconds / 60)}分钟</strong>
                </button>
              ))}
            </div>
          </article>
          <button type="button" className="music-guess-mode-card unlimited" onClick={() => onChoose({ mode: 'unlimited', durationSeconds: 0 })}>
            <div className="music-guess-mode-icon" aria-hidden="true">∞</div>
            <div className="music-guess-mode-copy">
              <p className="eyebrow">FREE PLAY</p>
              <h3>不限时模式</h3>
              <p>按照原有规则慢慢辨认旋律，不设倒计时，答错三次后结算。</p>
            </div>
            <span className="music-guess-mode-arrow" aria-hidden="true">→</span>
          </button>
        </section>
        <p className="music-guess-local-note">两种模式都会使用所选歌单的本地曲库与 15 秒片段。</p>
      </main>
    </div>
  );
}
