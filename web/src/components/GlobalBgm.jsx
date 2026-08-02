import { useEffect, useRef, useState } from 'react';
import bgmUrl from '../../../bgm/一花依世界-伴奏.mp3?url';

const VOLUME_STORAGE_KEY = 'luo-yi-ba-bgm-volume';
const DEFAULT_VOLUME = 0.35;

function readInitialVolume() {
  const stored = Number.parseFloat(window.localStorage.getItem(VOLUME_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_VOLUME;
}

export default function GlobalBgm() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readInitialVolume);
  const [error, setError] = useState('');

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    let disposed = false;

    const removeFallback = () => {
      document.removeEventListener('pointerdown', resumeAfterInteraction, true);
      document.removeEventListener('keydown', resumeAfterInteraction, true);
    };
    const tryPlay = async () => {
      try {
        await audio.play();
        if (!disposed) setError('');
        removeFallback();
      } catch {
        if (!disposed) setError('等待首次操作后自动播放');
      }
    };
    function resumeAfterInteraction() {
      void tryPlay();
    }

    void tryPlay();
    document.addEventListener('pointerdown', resumeAfterInteraction, true);
    document.addEventListener('keydown', resumeAfterInteraction, true);
    return () => {
      disposed = true;
      removeFallback();
    };
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError('');
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setError('浏览器暂时无法播放音频');
    }
  };

  return (
    <aside className={`bgm-player ${playing ? 'playing' : ''}`} aria-label="背景音乐播放器">
      <audio
        ref={audioRef}
        src={bgmUrl}
        autoPlay
        loop
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError('背景音乐加载失败')}
      />
      <button type="button" className="bgm-toggle" onClick={togglePlayback} aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}>
        <span className="bgm-icon" aria-hidden="true">{playing ? 'Ⅱ' : '♪'}</span>
        <span className="bgm-copy"><strong>一花依世界</strong><small>{error || (playing ? '正在播放 · 伴奏' : '点击播放背景音乐')}</small></span>
      </button>
      <label className="volume-control">
        <span className="sr-only">背景音乐音量</span>
        <span aria-hidden="true">{volume === 0 ? '×' : '◖'}</span>
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
      </label>
    </aside>
  );
}
