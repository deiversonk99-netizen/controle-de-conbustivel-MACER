import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drain } from '../src/data/sync.mjs';
import { normalizeCommand, amountCents, deltaFor, csv, civilDay } from '../src/domain/business.mjs';
const c = () =>
  normalizeCommand({
    kind: 'fuel',
    tankId: 'T1',
    assetId: 'A1',
    quantityMl: 25600,
    readingMilli: 100000,
    unitPriceMicros: 5990000,
  });
function setup(items) {
  let calls = 0;
  return {
    state: items,
    args: {
      uid: 'u',
      site: 's',
      list: async () => items.filter((q) => q.uid === 'u' && q.site === 's'),
      put: async (q) => {
        items[items.findIndex((i) => i.id === q.id)] = { ...q };
      },
      execute: async () => {
        calls++;
      },
      photo: async () => {},
      pending: async () => {},
      online: () => true,
      isCurrent: () => true,
    },
    calls: () => calls,
  };
}
test('outbox retries uncertain response with the same identifier and keeps errors', async () => {
  const command = c(),
    s = setup([{ id: command.id, uid: 'u', site: 's', command, state: 'queued' }]);
  let seen = [];
  s.args.execute = async (x) => {
    seen.push(x.id);
    if (seen.length === 1) throw Object.assign(Error('rede'), { code: 'unavailable' });
  };
  await drain(s.args);
  assert.equal(s.state[0].state, 'queued');
  await drain(s.args);
  assert.equal(s.state[0].state, 'synced');
  assert.deepEqual(seen, [command.id, command.id]);
});
test('business conflict is preserved, published and not retried endlessly', async () => {
  const command = c(),
    s = setup([{ id: command.id, uid: 'u', site: 's', command, state: 'queued' }]);
  let published = 0;
  s.args.execute = async () => {
    throw Error('Saldo insuficiente');
  };
  s.args.pending = async () => published++;
  await drain(s.args);
  await drain(s.args);
  assert.equal(s.state[0].state, 'conflict');
  assert.equal(s.state[0].command.quantityMl, 25600);
  assert.equal(published, 1);
});
test('photo retry never repeats the confirmed stock operation', async () => {
  const command = c(),
    s = setup([{ id: command.id, uid: 'u', site: 's', command, photo: 'photo', state: 'queued' }]);
  let photos = 0;
  s.args.photo = async () => {
    if (++photos === 1) throw Object.assign(Error('rede'), { code: 'unavailable' });
  };
  await drain(s.args);
  await drain(s.args);
  assert.equal(s.calls(), 1);
  assert.equal(s.state[0].state, 'synced');
});
test('does not dispatch offline, another account, or after session changes', async () => {
  for (const mode of ['offline', 'session']) {
    const command = c(),
      s = setup([
        { id: command.id, uid: 'u', site: 's', command, state: 'queued' },
        { id: 'other', uid: 'other', site: 's', state: 'queued' },
      ]);
    if (mode === 'offline') s.args.online = () => false;
    else s.args.isCurrent = () => false;
    await drain(s.args);
    assert.equal(s.calls(), 0);
    assert.equal(s.state[1].state, 'queued');
  }
});
test('integer currency, local civil day, transfer/reversal and CSV injection defense', () => {
  assert.equal(amountCents(25600, 5990000), 15334);
  assert.equal(civilDay(Date.parse('2026-10-01T02:00:00Z')), '2026-09-30');
  assert.equal(
    deltaFor(
      {
        kind: 'reversal',
        originalKind: 'transfer',
        tankId: 'a',
        destinationTankId: 'b',
        quantityMl: 1000,
      },
      'a',
    ),
    1000,
  );
  assert.match(csv([['=HYPERLINK("x")']]), /"'=HYPERLINK/);
});
