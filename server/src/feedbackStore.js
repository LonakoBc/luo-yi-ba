import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const FEEDBACK_CATEGORIES = ['catalog', 'gameplay', 'bug', 'other'];
export const FEEDBACK_STATUSES = ['pending', 'public', 'adopted', 'fixed', 'hidden', 'rejected'];
const PUBLIC_STATUSES = new Set(['public', 'adopted', 'fixed']);

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function cleanText(value, maximum) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

function safeAvatarUrl(value) {
  const url = cleanText(value, 500);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function publicProjection(item, { admin = false } = {}) {
  const projected = {
    id: item.id,
    category: item.category,
    content: item.content,
    author: item.author,
    context: item.context,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  if (admin) projected.identityKey = item.identityKey;
  return projected;
}

export class FeedbackStore {
  constructor({
    filePath = path.resolve('data/feedback.json'),
    now = () => Date.now(),
    createId = () => randomUUID(),
    rateLimit = 2,
    rateWindowMs = 60_000,
  } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.createId = createId;
    this.rateLimit = rateLimit;
    this.rateWindowMs = rateWindowMs;
    this.items = [];
    this.rateBuckets = new Map();
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  async persist() {
    const payload = `${JSON.stringify({ version: 1, items: this.items }, null, 2)}\n`;
    const temporary = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(temporary, payload, 'utf8');
      await rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }

  checkRateLimit(key) {
    const now = this.now();
    const recent = (this.rateBuckets.get(key) ?? []).filter((value) => now - value < this.rateWindowMs);
    if (recent.length >= this.rateLimit) throw httpError('提交太频繁，请稍后再试', 429);
    recent.push(now);
    this.rateBuckets.set(key, recent);
  }

  async create(input, { ip = 'unknown' } = {}) {
    const category = FEEDBACK_CATEGORIES.includes(input?.category) ? input.category : 'other';
    const content = cleanText(input?.content, 300);
    if (content.length < 4) throw httpError('反馈内容至少需要 4 个字符');
    const displayName = cleanText(input?.displayName, 20) || '匿名听众';
    const toyOpenId = cleanText(input?.toyOpenId, 160);
    const identityKey = toyOpenId
      ? createHash('sha256').update(`toy:${toyOpenId}`).digest('hex')
      : createHash('sha256').update(`anonymous:${ip}:${displayName}`).digest('hex');
    this.checkRateLimit(`${ip}:${identityKey}`);

    const now = new Date(this.now()).toISOString();
    const item = {
      id: this.createId(),
      category,
      content,
      author: {
        displayName,
        avatarUrl: safeAvatarUrl(input?.avatarUrl),
        source: toyOpenId ? 'bilibili' : 'anonymous',
      },
      identityKey,
      context: {
        page: cleanText(input?.context?.page, 120),
        label: cleanText(input?.context?.label, 80),
      },
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.items.unshift(item);
    await this.persist();
    return publicProjection(item);
  }

  listPublic({ limit = 40 } = {}) {
    return this.items.filter((item) => PUBLIC_STATUSES.has(item.status)).slice(0, Math.min(Math.max(Number(limit) || 40, 1), 100)).map((item) => publicProjection(item));
  }

  listAdmin({ status, limit = 200 } = {}) {
    const items = FEEDBACK_STATUSES.includes(status) ? this.items.filter((item) => item.status === status) : this.items;
    return items.slice(0, Math.min(Math.max(Number(limit) || 200, 1), 500)).map((item) => publicProjection(item, { admin: true }));
  }

  async updateStatus(id, status) {
    if (!FEEDBACK_STATUSES.includes(status)) throw httpError('未知的反馈状态');
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw httpError('反馈不存在', 404);
    item.status = status;
    item.updatedAt = new Date(this.now()).toISOString();
    await this.persist();
    return publicProjection(item, { admin: true });
  }

  counts() {
    return Object.fromEntries(FEEDBACK_STATUSES.map((status) => [status, this.items.filter((item) => item.status === status).length]));
  }
}
