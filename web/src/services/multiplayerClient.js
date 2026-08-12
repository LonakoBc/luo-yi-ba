import { catalogVersionFor } from './multiplayerRules';

export const MULTIPLAYER_API_URL = String(import.meta.env.VITE_MULTIPLAYER_API_URL ?? '').replace(/\/$/u, '');

async function request(path, options = {}) {
  const response = await fetch(`${MULTIPLAYER_API_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? '联机服务暂时不可用');
  return data;
}

export function createRoom(payload, songs) {
  return request('/api/rooms', { method: 'POST', body: JSON.stringify({ ...payload, catalogVersion: catalogVersionFor(songs) }) });
}

export function joinRoom(code, nickname) {
  return request(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({ nickname }) });
}

export function saveRoomIdentity(identity) {
  localStorage.setItem(`luo-yi-ba-room:${identity.code}`, JSON.stringify(identity));
}

export function loadRoomIdentity(code) {
  try { return JSON.parse(localStorage.getItem(`luo-yi-ba-room:${code}`)); } catch { return null; }
}

export function roomSocketUrl(code, token) {
  const base = new URL(MULTIPLAYER_API_URL || window.location.origin, window.location.origin);
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = `/api/rooms/${code}/socket`;
  base.search = new URLSearchParams({ token }).toString();
  return base.toString();
}
