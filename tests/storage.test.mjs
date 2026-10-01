import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queuePut, queueList, cachePut, cacheGet } from '../src/data/offline.ts';
test('IndexedDB persists records and separates account/unit queues', async () => {
  await queuePut({
    id: 'a',
    uid: 'one',
    site: 'x',
    command: { id: 'a' },
    state: 'queued',
    queuedAt: 1,
  });
  await queuePut({
    id: 'b',
    uid: 'two',
    site: 'x',
    command: { id: 'b' },
    state: 'queued',
    queuedAt: 2,
  });
  await queuePut({
    id: 'c',
    uid: 'one',
    site: 'y',
    command: { id: 'c' },
    state: 'queued',
    queuedAt: 3,
  });
  assert.deepEqual(
    (await queueList('one', 'x')).map((r) => r.id),
    ['a'],
  );
  assert.equal((await queueList('one')).length, 2);
  await cachePut('one:x', { assets: [{ id: 'A1' }] });
  assert.deepEqual(await cacheGet('one:x'), { assets: [{ id: 'A1' }] });
  assert.equal(await cacheGet('two:x'), undefined);
});
