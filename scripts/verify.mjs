import { execFileSync } from 'node:child_process';
execFileSync(
  process.execPath,
  ['--test', 'tests/rules/stock.test.mjs', 'tests/rules/ledger.test.mjs'],
  { stdio: 'inherit' },
);
execFileSync(process.execPath, ['scripts/e2e.mjs'], { stdio: 'inherit' });
