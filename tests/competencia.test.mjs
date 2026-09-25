import test from 'node:test';
import assert from 'node:assert/strict';
import { competencia } from '../src/domain/competencia.mjs';

test('preserva o dia 20 e avança no dia 21', () => {
  assert.equal(competencia('2026-09-20'), '2026-09');
  assert.equal(competencia('2026-09-21'), '2026-10');
});
test('trata a virada de ano', () => {
  assert.equal(competencia('2026-12-21'), '2027-01');
});
test('valida data civil e ano bissexto', () => {
  assert.equal(competencia('2028-02-29'), '2028-03');
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '20/09/2026', '']) {
    assert.throws(() => competencia(value));
  }
});
