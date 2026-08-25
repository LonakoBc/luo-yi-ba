import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FeedbackStore } from '../src/feedbackStore.js';

async function createStore(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'luo-yi-ba-feedback-'));
  const filePath = path.join(directory, 'feedback.json');
  const store = new FeedbackStore({ filePath, ...options });
  await store.initialize();
  return { store, filePath };
}

test('新反馈先进入审核队列，公开后才出现在公共列表', async () => {
  const { store, filePath } = await createStore({ createId: () => 'feedback-1', now: () => Date.parse('2026-08-24T00:00:00Z') });
  const created = await store.create({ category: 'catalog', content: '万象霜天的分类需要修改', displayName: '测试者', toyOpenId: 'private-open-id' }, { ip: '127.0.0.1' });
  assert.equal(created.status, 'pending');
  assert.equal(store.listPublic().length, 0);
  assert.equal('identityKey' in created, false);

  const reviewed = await store.updateStatus(created.id, 'public');
  assert.equal(reviewed.status, 'public');
  const publicItem = store.listPublic()[0];
  assert.equal(publicItem.content, '万象霜天的分类需要修改');
  assert.equal('identityKey' in publicItem, false);

  const restored = new FeedbackStore({ filePath });
  await restored.initialize();
  assert.equal(restored.listPublic()[0].id, created.id);
  assert.doesNotMatch(await readFile(filePath, 'utf8'), /private-open-id/u);
});

test('同一来源一分钟最多提交两次', async () => {
  let now = 1_000;
  let id = 0;
  const { store } = await createStore({ now: () => now, createId: () => `id-${++id}` });
  const input = { category: 'bug', content: '这里有一个需要修复的问题', displayName: '匿名' };
  await store.create(input, { ip: '10.0.0.1' });
  await store.create(input, { ip: '10.0.0.1' });
  await assert.rejects(store.create(input, { ip: '10.0.0.1' }), (error) => error.status === 429);
  now += 60_001;
  await store.create(input, { ip: '10.0.0.1' });
});

test('反馈内容与状态会被校验', async () => {
  const { store } = await createStore();
  await assert.rejects(store.create({ content: '短' }), /至少需要 4 个字符/u);
  await assert.rejects(store.updateStatus('missing', 'unknown'), /未知的反馈状态/u);
});
