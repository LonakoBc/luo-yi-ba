import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MIN_REQUEST_DELAY_MS = 30_000;
export const MAX_ATTEMPTS = 3;

export function retryAfterMs(value, fallback = MIN_REQUEST_DELAY_MS) {
  if (!value) return fallback;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(fallback, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? fallback : Math.max(fallback, date - Date.now());
}

export class PoliteFetcher {
  #lastCompletedAt = null;

  constructor({
    cacheDir,
    refresh = false,
    minDelayMs = MIN_REQUEST_DELAY_MS,
    maxAttempts = MAX_ATTEMPTS,
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
  }) {
    this.cacheDir = cacheDir;
    this.refresh = refresh;
    this.minDelayMs = minDelayMs;
    this.maxAttempts = maxAttempts;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.now = now;
  }

  async requestJson({ url, cacheKey, method = 'GET', body }) {
    const cachePath = this.cacheDir ? path.join(this.cacheDir, `${cacheKey}.json`) : null;
    if (cachePath && !this.refresh) {
      try { return JSON.parse(await readFile(cachePath, 'utf8')); } catch { /* Cache miss. */ }
    }
    if (this.cacheDir) await mkdir(this.cacheDir, { recursive: true });

    let lastError;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (this.#lastCompletedAt !== null) {
        const remaining = this.minDelayMs - (this.now() - this.#lastCompletedAt);
        if (remaining > 0) await this.sleep(remaining);
      }
      let response;
      try {
        response = await this.fetchImpl(url, {
          method,
          body,
          headers: {
            'user-agent': 'LuoYiBaDataCrawler/2.0 (+https://github.com/LonakoBc/luo-yi-ba)',
            accept: 'application/json',
            ...(body ? { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' } : {}),
          },
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} ${response.statusText}`), { response });
        const data = await response.json();
        if (data.error) throw new Error(`MediaWiki API: ${data.error.code} ${data.error.info}`);
        if (cachePath) await writeFile(cachePath, `${JSON.stringify(data)}\n`, 'utf8');
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxAttempts) {
          const retryDelay = retryAfterMs(response?.headers?.get?.('retry-after'), this.minDelayMs);
          if (retryDelay > this.minDelayMs) await this.sleep(retryDelay - this.minDelayMs);
        }
      } finally {
        this.#lastCompletedAt = this.now();
      }
    }
    throw lastError;
  }
}
