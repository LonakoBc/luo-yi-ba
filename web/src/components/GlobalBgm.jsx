import { useCallback, useEffect, useRef, useState } from 'react';
import gouzhiUrl from '../../../bgm/01-勾指起誓.mp3?url';
import discoUrl from '../../../bgm/02-普通DISCO.mp3?url';
import sadnessUrl from '../../../bgm/03-我的悲伤是水做的.mp3?url';
import ichikaUrl from '../../../bgm/04-一花依世界.mp3?url';
import seimatsuUrl from '../../../bgm/05-世末歌者.mp3?url';

const VOLUME_STORAGE_KEY = 'luo-yi-ba-bgm-volume';
const DEFAULT_VOLUME = 0.35;

export const BGM_TRACKS = [
  { id: 'gouzhi', name: '01-勾指起誓', url: gouzhiUrl },
  { id: 'disco', name: '02-普通DISCO', url: discoUrl },
  { id: 'sadness', name: '03-我的悲伤是水做的', url: sadnessUrl },
  { id: 'ichika', name: '04-一花依世界', url: ichikaUrl },
  { id: 'seimatsu', name: '05-世末歌者', url: seimatsuUrl },
];

function readInitialVolume() {
  const stored = Number.parseFloat(window.localStorage.getItem(VOLUME_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_VOLUME;
}

export default function GlobalBgm({ random = Math.random }) {
  const audioRef = useRef(null);
  const [trackIndex, setTrackIndex] = useState(() => Math.min(BGM_TRACKS.length - 1, Math.floor(random() * BGM_TRACKS.length)));
  const previousTrackIndex = useRef(trackIndex);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readInitialVolume);
  const [error, setError] = useState('');
  const track = BGM_TRACKS[trackIndex];

  const playCurrent = useCallback(async (fallbackMessage = '浏览器暂时无法播放音频') => {
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      await audio.play();
      setError('');
      return true;
    } catch {
      setError(fallbackMessage);
      return false;
    }
  }, []);

  const nextTrack = useCallback(() => {
    setError('');
    setTrackIndex((current) => (current + 1) % BGM_TRACKS.length);
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const removeFallback = () => {
      document.removeEventListener('pointerdown', resumeAfterInteraction, true);
      document.removeEventListener('keydown', resumeAfterInteraction, true);
    };
    const tryPlay = async () => {
      const succeeded = await playCurrent('等待首次操作后自动播放');
      if (succeeded) {
        removeFallback();
      }
    };
    function resumeAfterInteraction() {
      void tryPlay();
    }

    void tryPlay();
    document.addEventListener('pointerdown', resumeAfterInteraction, true);
    document.addEventListener('keydown', resumeAfterInteraction, true);
    return () => {
      removeFallback();
    };
  }, [playCurrent]);

  useEffect(() => {
    if (previousTrackIndex.current === trackIndex) return;
    previousTrackIndex.current = trackIndex;
    void playCurrent();
  }, [playCurrent, trackIndex]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setError('');
    if (!audio.paused) {
      audio.pause();
      return;
    }
    await playCurrent();
  };

  return (
    <aside className={`bgm-player ${playing ? 'playing' : ''}`} aria-label="背景音乐播放器">
      <audio
        ref={audioRef}
        src={track.url}
        autoPlay
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={nextTrack}
        onError={() => setError('背景音乐加载失败')}
      />
      <button type="button" className="bgm-toggle" onClick={togglePlayback} aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}>
        <span className="bgm-icon" aria-hidden="true">{playing ? 'Ⅱ' : '♪'}</span>
        <span className="bgm-copy"><strong>{track.name}</strong><small>{error || (playing ? '正在播放' : '点击播放背景音乐')}</small></span>
      </button>
      <button type="button" className="bgm-next" onClick={nextTrack} aria-label="播放下一首背景音乐" title="下一首">››</button>
      <label className="volume-control">
        <span className="sr-only">背景音乐音量</span>
        <span aria-hidden="true">{volume === 0 ? '×' : '◖'}</span>
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
      </label>
    </aside>
  );
}
