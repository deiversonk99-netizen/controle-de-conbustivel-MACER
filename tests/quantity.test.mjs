import test from 'node:test';
import assert from 'node:assert/strict';
import { toMilli } from '../src/domain/quantity.mjs';
test('quantidades decimais são armazenadas sem arredondamento binário', () => {
  assert.equal(toMilli('25,601'), 25601);
  assert.equal(toMilli('0.001'), 1);
  assert.equal(toMilli('100'), 100000);
  for (const value of ['-1','1e3','1,234.5','1.0001','NaN','']) assert.throws(() => toMilli(value));
});
