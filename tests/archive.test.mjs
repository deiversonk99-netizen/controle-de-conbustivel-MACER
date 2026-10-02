import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePackage,
  normalizeArchiveRow,
  rowHash,
  sameArchivedRow,
} from '../src/domain/archive.mjs';
const row = {
  id: 'a'.repeat(64),
  kind: 'legacy-out',
  businessDate: '2026-09-13',
  quantityMl: 25600,
  assetId: 'CA111',
  sourceUnit: 'MC101',
  sourcePersonLabel: 'MOT.',
  personName: 'Pessoa na origem',
  legacyReading: '101,2',
  reference: 'NF',
  unitPriceText: '6.12',
  totalText: '156.672',
  product: 'diesel-nao-especificado',
  sourceSheet: 'CA111',
  sourceRow: 9,
  sourceColumn: 'Q',
  issues: ['Conferir produto'],
};
const pkg = {
  format: 'macer-archive-v1',
  sourceName: 'origem.xlsx',
  sourceHash: 'b'.repeat(64),
  records: [row],
  catalogs: [],
  rejected: [],
  summary: [],
};
test('historical dates and neutral movement remain separate from the stock command', () => {
  const actual = normalizeArchiveRow({ ...row, tankId: 'CURRENT', createdBy: 'fake' });
  assert.equal(actual.businessDate, '2026-09-13');
  assert.equal(actual.kind, 'legacy-out');
  assert.equal(actual.tankId, undefined);
  assert.equal(actual.createdBy, undefined);
  assert.equal(actual.legacyReading, '101,2');
});
test('duplicates, invalid dates and invalid quantities are refused before writing', () => {
  assert.throws(() => normalizePackage({ ...pkg, records: [row, row] }), /repetidos/);
  assert.throws(() => normalizeArchiveRow({ ...row, businessDate: '2026-02-30' }), /Data/);
  assert.throws(() => normalizeArchiveRow({ ...row, quantityMl: -1 }), /Número/);
  assert.throws(() => normalizeArchiveRow({ ...row, quantityMl: 1.1 }), /Número/);
});
test('resumed identical source rows compare consistently; changed source values conflict', async () => {
  const previous = { ...row, sourceHash: 'b'.repeat(64), importedBy: 'admin' };
  assert.ok(sameArchivedRow(previous, row));
  assert.ok(!sameArchivedRow(previous, { ...row, quantityMl: 27000 }));
  assert.equal(await rowHash(row), await rowHash({ ...row, importedAt: 123 }));
  assert.notEqual(await rowHash(row), await rowHash({ ...row, quantityMl: 27000 }));
});
