import { USES_HASH_ROUTING, browserPath } from './appRouting';

export const IS_TOY_BUILD = USES_HASH_ROUTING;

export function toyApi() {
  return IS_TOY_BUILD && typeof window !== 'undefined' ? window.toy ?? null : null;
}

export async function supportsToyAbility(ability) {
  const api = toyApi();
  if (!api?.isSupport) return false;
  try { return await api.isSupport(ability); }
  catch { return false; }
}

export async function shareToyPath(path) {
  const api = toyApi();
  if (!api?.share || !await supportsToyAbility('share')) return false;
  await api.share({ path: `index.html${browserPath(path, true)}` });
  return true;
}

export async function getToyUserProfile() {
  const api = toyApi();
  if (!api?.getUserProfile || !await supportsToyAbility('getUserProfile')) return null;
  return api.getUserProfile();
}
