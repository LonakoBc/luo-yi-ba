import { MULTIPLAYER_API_URL } from './multiplayerClient';

async function request(path, options = {}) {
  const response = await fetch(`${MULTIPLAYER_API_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `请求失败（${response.status}）`);
  return body;
}

export async function listFeedback() {
  return (await request('/api/feedback?limit=40')).items;
}

export async function submitFeedback(input) {
  return (await request('/api/feedback', { method: 'POST', body: JSON.stringify(input) })).item;
}

export async function loginFeedbackAdmin(password) {
  return request('/api/feedback/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
}

export async function listFeedbackAdmin(token, status = '') {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/feedback/admin${suffix}`, { headers: { authorization: `Bearer ${token}` } });
}

export async function updateFeedbackStatus(token, id, status) {
  return request(`/api/feedback/admin/${id}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
}
