import test from 'node:test';
import assert from 'node:assert/strict';
import { unitValues, normalizeMeasurement } from '../src/data/setup.mjs';
test('preparation preserves company CRs and requires a responsible contact', () => {
  const v = unitValues({
    name: ' Obra ',
    crs: 'mc101, MC101; mc-102',
    responsibleName: ' Responsável ',
    responsibleEmail: 'pessoa@example.com',
  });
  assert.deepEqual(v.crs, ['MC101', 'MC-102']);
  assert.equal(v.name, 'Obra');
  assert.throws(() => unitValues({ ...v, crs: 'MC101', responsibleEmail: 'inválido' }), /e-mail/);
});
test('physical measurement accepts empty tanks but rejects future, stale or invalid measurements', () => {
  const now = Date.now(),
    r = {
      tankId: 'T1',
      physicalMl: 0,
      measuredAtMs: now,
      measuredByName: 'Pessoa',
      reference: 'Régua',
      noMovementsSince: true,
    };
  assert.equal(normalizeMeasurement(r, now).physicalMl, 0);
  assert.throws(() => normalizeMeasurement({ ...r, physicalMl: -1 }, now), /saldo/);
  assert.throws(() => normalizeMeasurement({ ...r, measuredAtMs: now + 600000 }, now), /medição/);
  assert.throws(
    () => normalizeMeasurement({ ...r, measuredAtMs: now - 31 * 86400000 }, now),
    /medição/,
  );
});
