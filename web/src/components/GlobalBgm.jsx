import { useCallback, useEffect, useRef, useState } from 'react';
import { bgmModules } from '#bgm-catalog';
import { BGM_CONFIG, fetchBgmPlaylist } from '../services/bgmService';
const VOLUME_STORAGE_KEY = 'luo-yi-ba-bgm-volume';
const DEFAULT_VOLUME = 0.35;
const DEFERRED_AUTOPLAY_DELAY_MS = 850;

export const BGM_TRACKS = Object.entries(bgmModules).map(([filePath, url]) => {
  const fileName = filePath.split('/').pop().replace(/\.mp3$/iu, '');
  return { id: fileName, name: fileName, artist: '本地音频', url, cover: '', lyric: '' };
}).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));

function readInitialVolume() {
  const stored = Number.parseFloat(window.localStorage.getItem(VOLUME_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_VOLUME;
}

export default function GlobalBgm({ random = Math.random, playlistLoader = fetchBgmPlaylist, suspended = false }) {
  const audioRef = useRef(null);
  const deferredPlayTimer = useRef(null);
  const initialRandom = useRef();
  if (initialRandom.current === undefined) initialRandom.current = random();
  const [tracks, setTracks] = useState(BGM_TRACKS);
  const [trackIndex, setTrackIndex] = useState(() => Math.min(BGM_TRACKS.length - 1, Math.floor(initialRandom.current * BGM_TRACKS.length)));
  const previousTrackId = useRef(BGM_TRACKS[trackIndex]?.id);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(readInitialVolume);
  const [error, setError] = useState('');
  const [playlistStatus, setPlaylistStatus] = useState('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  const track = tracks[trackIndex] || tracks[0];

  const playCurrent = useCallback(async (fallbackMessage = '浏览器暂时无法播放音频') => {
    const audio = audioRef.current;
    if (!audio || suspended) return false;
    try {
      await audio.play();
      setError('');
      return true;
    } catch {
      setError(fallbackMessage);
      return false;
    }
  }, [suspended]);

  const nextTrack = useCallback(() => {
    setError('');
    setTrackIndex((current) => (current + 1) % tracks.length);
  }, [tracks.length]);

  useEffect(() => {
    let cancelled = false;
    void playlistLoader({ config: BGM_CONFIG }).then((remoteTracks) => {
      if (cancelled || !remoteTracks.length) return;
      const remoteIndex = Math.min(remoteTracks.length - 1, Math.floor(initialRandom.current * remoteTracks.length));
      // Loading the remote catalog should not trigger an unsolicited autoplay.
      previousTrackId.current = remoteTracks[remoteIndex]?.id;
      setTracks(remoteTracks);
      setTrackIndex(remoteIndex);
      setError('');
      setPlaylistStatus('remote');
    }).catch(() => {
      if (!cancelled) setPlaylistStatus('fallback');
    });
    return () => { cancelled = true; };
  }, [playlistLoader]);

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
    function resumeAfterInteraction(event) {
      removeFallback();
      if (suspended || (event.target instanceof Element && event.target.closest('.bgm-player'))) return;
      window.clearTimeout(deferredPlayTimer.current);
      deferredPlayTimer.current = window.setTimeout(() => {
        void playCurrent('点击音乐按钮即可继续播放');
      }, DEFERRED_AUTOPLAY_DELAY_MS);
    }

    document.addEventListener('pointerdown', resumeAfterInteraction, true);
    document.addEventListener('keydown', resumeAfterInteraction, true);
    return () => {
      removeFallback();
      window.clearTimeout(deferredPlayTimer.current);
    };
  }, [playCurrent, suspended]);

  useEffect(() => {
    if (!suspended) return;
    audioRef.current?.pause();
    setPlaying(false);
  }, [suspended]);

  useEffect(() => {
    if (!track || previousTrackId.current === track.id) return;
    previousTrackId.current = track.id;
    void playCurrent();
  }, [playCurrent, track]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || suspended) return;
    setError('');
    if (!audio.paused) {
      audio.pause();
      return;
    }
    await playCurrent();
  };

  const selectTrack = (index) => {
    setError('');
    setPickerOpen(false);
    if (index === trackIndex) void playCurrent();
    else setTrackIndex(index);
  };

  const playlistHint = error || (playlistStatus === 'loading'
    ? '正在连接网易云歌单'
    : playlistStatus === 'remote'
      ? `${track.artist || '网易云音乐'} · 联网歌单`
      : '联网失败，使用本地音频');

  return (
    <aside className={`bgm-player ${playing ? 'playing' : ''}`} aria-label="背景音乐播放器">
      <audio
        ref={audioRef}
        src={track?.url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={nextTrack}
        onError={() => setError('背景音乐加载失败')}
      />
      <button type="button" className="bgm-toggle" onClick={togglePlayback} aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}>
        {track?.cover ? <img className="bgm-cover" src={track.cover} alt="" /> : <span className="bgm-icon" aria-hidden="true">{playing ? 'Ⅱ' : '♪'}</span>}
        <span className="bgm-copy"><strong>{track?.name || '背景音乐'}</strong><small>{playing ? '正在播放' : playlistHint}</small></span>
      </button>
      <div className="bgm-picker-wrap">
        <button type="button" className="bgm-pick" onClick={() => setPickerOpen((open) => !open)} aria-expanded={pickerOpen} aria-controls="bgm-track-list" aria-label="选择背景音乐">♫</button>
        {pickerOpen && <div id="bgm-track-list" className="bgm-track-list" role="menu">{tracks.map((item, index) => <button type="button" role="menuitemradio" aria-checked={index === trackIndex} className={index === trackIndex ? 'active' : ''} key={`${item.id}-${index}`} onClick={() => selectTrack(index)}><span><strong>{item.name}</strong><small>{item.artist}</small></span>{index === trackIndex && <small>{playing ? '播放中' : '当前曲目'}</small>}</button>)}</div>}
      </div>
      <button type="button" className="bgm-next" onClick={nextTrack} aria-label="播放下一首背景音乐" title="下一首">››</button>
      <label className="volume-control">
        <span className="sr-only">背景音乐音量</span>
        <span aria-hidden="true">{volume === 0 ? '×' : '◖'}</span>
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
      </label>
    </aside>
  );
}
