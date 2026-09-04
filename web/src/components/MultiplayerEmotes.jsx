import { useEffect, useRef, useState } from 'react';
import { MULTIPLAYER_EMOTES, multiplayerEmoteFor } from '../services/multiplayerEmotes';
import './MultiplayerEmotes.css';

const emoteModules = import.meta.glob('../assets/multiplayer-emotes/png/*.png', { eager: true, query: '?url', import: 'default' });
const EMOTE_IMAGES = Object.freeze(Object.fromEntries(MULTIPLAYER_EMOTES.map((emote) => [
  emote.id,
  emoteModules[`../assets/multiplayer-emotes/png/${emote.fileName}`],
])));
const missingEmoteImages = MULTIPLAYER_EMOTES.filter((emote) => !EMOTE_IMAGES[emote.id]);
if (missingEmoteImages.length) throw new Error(`缺少联机表情资源：${missingEmoteImages.map(({ fileName }) => fileName).join('、')}`);

export const MULTIPLAYER_EMOTE_VISIBLE_MS = 2_800;

export function multiplayerEmoteImage(id) {
  return EMOTE_IMAGES[id] ?? null;
}

export function useMultiplayerEmotePopups() {
  const [popups, setPopups] = useState([]);
  const timers = useRef(new Map());

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  const show = (event) => {
    if (!multiplayerEmoteFor(event?.emoteId) || !event?.playerId) return;
    const popup = { ...event, key: `${event.playerId}:${event.sentAt ?? Date.now()}` };
    setPopups((current) => [...current.filter((item) => item.playerId !== event.playerId), popup]);
    window.clearTimeout(timers.current.get(event.playerId));
    timers.current.set(event.playerId, window.setTimeout(() => {
      setPopups((current) => current.filter((item) => item.key !== popup.key));
      timers.current.delete(event.playerId);
    }, MULTIPLAYER_EMOTE_VISIBLE_MS));
  };

  return [popups, show];
}

export function MultiplayerEmotePopups({ popups, players, selfId }) {
  if (!popups.length) return null;
  return <div className="multiplayer-emote-popups" aria-live="polite">
    {popups.map((popup) => {
      const player = players.find((item) => item.id === popup.playerId);
      const emote = multiplayerEmoteFor(popup.emoteId);
      const image = multiplayerEmoteImage(popup.emoteId);
      if (!player || !emote || !image) return null;
      return <figure key={popup.key} className="multiplayer-emote-popup" style={{ '--player-color': player.color?.color }}>
        <img src={image} alt={`${player.nickname}发送了${emote.label}表情`} />
        <figcaption><span>{player.nickname}{player.id === selfId ? '（你）' : ''}</span><b>{emote.label}</b></figcaption>
      </figure>;
    })}
  </div>;
}

export function MultiplayerEmotePicker({ disabled, onSend }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const scrollRef = useRef(null);
  const paginationTimerRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const startDrag = (event) => {
    const isTrigger = event.currentTarget.classList.contains('multiplayer-emote-trigger');
    if ((!isTrigger && event.target.closest('button')) || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressClickRef.current = false;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: position.x, y: position.y };
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) suppressClickRef.current = true;
    setPosition({ x: drag.x + event.clientX - drag.startX, y: drag.y + event.clientY - drag.startY });
  };
  const endDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };
  const toggleOpen = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  };
  const syncPagination = () => {
    const element = scrollRef.current;
    if (!element) return;
    const itemsPerPage = window.matchMedia?.('(max-width: 700px)').matches ? 4 : 12;
    const pages = Math.max(1, Math.ceil(MULTIPLAYER_EMOTES.length / itemsPerPage));
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    const positions = Array.from({ length: pages }, (_, index) => index === pages - 1 ? maxScroll : Math.min(index * element.clientWidth, maxScroll));
    const nearestPage = positions.reduce((best, position, index) => Math.abs(element.scrollLeft - position) < Math.abs(element.scrollLeft - positions[best]) ? index : best, 0);
    setPageCount(pages);
    setPage(nearestPage);
  };
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(syncPagination);
    window.addEventListener('resize', syncPagination);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(paginationTimerRef.current);
      window.removeEventListener('resize', syncPagination);
    };
  }, [open]);
  const handleScroll = () => {
    window.clearTimeout(paginationTimerRef.current);
    paginationTimerRef.current = window.setTimeout(syncPagination, 140);
  };
  const scrollPage = (direction) => {
    const element = scrollRef.current;
    if (!element) return;
    const nextPage = Math.max(0, Math.min(pageCount - 1, page + direction));
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    const left = nextPage === pageCount - 1 ? maxScroll : Math.min(nextPage * element.clientWidth, maxScroll);
    setPage(nextPage);
    element.scrollTo({ left, behavior: 'smooth' });
  };
  return <div className={`multiplayer-emote-picker ${open ? 'open' : ''}`} style={{ '--emote-offset-x': String(position.x) + 'px', '--emote-offset-y': String(position.y) + 'px' }}>
    {open && <section className="multiplayer-emote-panel" aria-label="联机表情">
      <header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><div><strong>发送表情</strong><small>28 张 · 房间内所有玩家可见 · 拖动此处移动卡片</small></div><button type="button" aria-label="关闭表情面板" onClick={() => setOpen(false)}>×</button></header>
      <div className="multiplayer-emote-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="multiplayer-emote-grid">{MULTIPLAYER_EMOTES.map((emote) => <button key={emote.id} type="button" disabled={disabled} onClick={() => { onSend(emote.id); setOpen(false); }} aria-label={`发送${emote.singer}${emote.label}表情`}>
          <img src={multiplayerEmoteImage(emote.id)} alt="" /><span>{emote.label}</span><small>{emote.singer}</small>
        </button>)}</div>
      </div>
      <footer><button type="button" aria-label="上一页表情" disabled={page === 0} onClick={() => scrollPage(-1)}>‹</button><span>第 {page + 1} / {pageCount} 页</span><button type="button" aria-label="下一页表情" disabled={page >= pageCount - 1} onClick={() => scrollPage(1)}>›</button></footer>
    </section>}
    <button className="multiplayer-emote-trigger" type="button" aria-expanded={open} aria-label={open ? '收起表情' : '打开表情'} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={toggleOpen} disabled={disabled}>
      <span aria-hidden="true">☺</span><b>表情</b>
    </button>
  </div>;
}
