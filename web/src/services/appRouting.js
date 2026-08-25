export const USES_HASH_ROUTING = import.meta.env.VITE_BUILD_TARGET === 'toy';

function normalizedPath(path) {
  const value = String(path || '/');
  return value.startsWith('/') ? value : `/${value}`;
}

export function readRouteLocation(location = window.location, hashRouting = USES_HASH_ROUTING) {
  if (!hashRouting) return { pathname: location.pathname, search: location.search };
  const hashPath = String(location.hash || '').replace(/^#/u, '') || '/';
  const parsed = new URL(normalizedPath(hashPath), 'https://toy.local');
  return { pathname: parsed.pathname, search: parsed.search };
}

export function browserPath(path, hashRouting = USES_HASH_ROUTING) {
  const normalized = normalizedPath(path);
  return hashRouting ? `#${normalized}` : normalized;
}

export function appUrl(path, location = window.location, hashRouting = USES_HASH_ROUTING) {
  const normalized = normalizedPath(path);
  if (!hashRouting) return new URL(normalized, location.origin).toString();
  const url = new URL(location.href);
  url.hash = normalized;
  return url.toString();
}
