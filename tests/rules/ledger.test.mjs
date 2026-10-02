import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  execute,
  saveCatalog,
  review,
  closeTank,
  savePhoto,
  savePending,
  dismissPending,
} from '../../src/data/ledger.mjs';
import { normalizeCommand, civilDay } from '../../src/domain/business.mjs';
import { importArchive } from '../../src/data/archive.mjs';
import { rowHash } from '../../src/domain/archive.mjs';
let env;
const client = (uid) => env.authenticatedContext(uid).firestore(),
  ref = (db, g, id) => doc(db, 'sites', 'base', g, id);
const command = (extra = {}) =>
  normalizeCommand({
    id: crypto.randomUUID(),
    kind: 'fuel',
    tankId: 'T1',
    assetId: 'A1',
    driverId: 'D1',
    quantityMl: 10000,
    readingMilli: 101000,
    unitPriceMicros: 6123456,
    ...extra,
  });
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-macer-v2',
    firestore: { rules: await readFile('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env?.cleanup());
const archiveRow = (id = 'a'.repeat(64)) => ({
  id,
  kind: 'legacy-out',
  businessDate: '2025-02-13',
  quantityMl: 25600,
  assetId: 'A1',
  operatorName: 'Origem',
  legacyReading: '101,2',
  reference: '',
  unitPriceText: '',
  totalText: '',
  product: 'diesel-nao-especificado',
  sourceSheet: 'CA111',
  sourceRow: 9,
  sourceColumn: 'Q',
  issues: ['Conferir diesel'],
});
const archivePackage = (records = [archiveRow()]) => ({
  format: 'macer-archive-v1',
  sourceName: 'teste.xlsx',
  sourceHash: 'b'.repeat(64),
  records,
  catalogs: [],
  rejected: [],
  summary: [],
});
test('archive import is immutable, resumable and does not change current stock or readings', async () => {
  const db = client('admin'),
    p = archivePackage();
  const first = await importArchive(db, 'base', 'admin', p, ['CA111']);
  assert.equal(first.inserted, 1);
  const second = await importArchive(db, 'base', 'admin', p, ['CA111']);
  assert.equal(second.inserted, 0);
  assert.equal(second.skipped, 1);
  assert.equal((await getDoc(ref(db, 'tanks', 'T1'))).data().balanceMl, 50000);
  assert.equal((await getDoc(ref(db, 'assets', 'A1'))).data().readingMilli, 100000);
  assert.equal((await getDocs(collection(db, 'sites', 'base', 'operations'))).size, 0);
  await assert.rejects(
    importArchive(db, 'base', 'admin', archivePackage([{ ...archiveRow(), quantityMl: 30000 }]), [
      'CA111',
    ]),
    /outros valores/,
  );
  await assertFails(updateDoc(ref(db, 'legacyHistory', p.records[0].id), { quantityMl: 1 }));
  await assertSucceeds(getDoc(ref(client('manager'), 'legacyHistory', p.records[0].id)));
  await assertFails(getDoc(ref(client('operator'), 'legacyHistory', p.records[0].id)));
  await assertFails(getDoc(ref(client('other'), 'legacyHistory', p.records[0].id)));
});
test('archive requires own-unit administrator, provenance and strict immutable schema', async () => {
  const db = client('admin'),
    p = archivePackage();
  await assert.rejects(
    importArchive(client('manager'), 'base', 'manager', p, ['CA111']),
    /administrador/,
  );
  await assert.rejects(importArchive(db, 'other', 'admin', p, ['CA111']), /administrador/);
  const { id, ...row } = archiveRow();
  const values = {
    ...row,
    contentHash: await rowHash({ id, ...row }),
    sourceHash: p.sourceHash,
    importedBy: 'admin',
    importedAt: serverTimestamp(),
  };
  await assertFails(setDoc(ref(db, 'legacyHistory', id), values)); // No manifest.
  await importArchive(db, 'base', 'admin', p, ['CA111']);
  await assertFails(
    setDoc(ref(db, 'legacyHistory', 'c'.repeat(64)), { ...values, quantityMl: -1 }),
  );
  await assertFails(setDoc(ref(db, 'legacyHistory', 'c'.repeat(64)), { ...values, tankId: 'T1' }));
  await assertFails(
    setDoc(ref(db, 'legacyHistory', 'c'.repeat(64)), { ...values, importedBy: 'manager' }),
  );
});
test('archive import processes multiple batches and a stopped import can safely resume', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({
    ...archiveRow(i.toString(16).padStart(64, '0')),
    sourceRow: i + 5,
  }));
  const p = archivePackage(rows),
    db = client('admin');
  let stop = false;
  const partial = await importArchive(
    db,
    'base',
    'admin',
    p,
    ['CA111'],
    () => {
      stop = true;
    },
    () => stop,
  );
  assert.equal(partial.inserted, 20);
  assert.ok(partial.stopped);
  const resumed = await importArchive(db, 'base', 'admin', p, ['CA111']);
  assert.equal(resumed.inserted, 5);
  assert.equal(resumed.skipped, 20);
  assert.equal((await getDocs(collection(db, 'sites', 'base', 'legacyHistory'))).size, 25);
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, role, sites] of [
      ['admin', 'admin', ['base']],
      ['manager', 'manager', ['base']],
      ['operator', 'operator', ['base']],
      ['other', 'operator', ['other']],
    ])
      await setDoc(doc(db, 'users', id), { name: id, role, siteIds: sites, active: true });
    for (const [id, balance] of [
      ['T1', 50000],
      ['T2', 0],
    ])
      await setDoc(ref(db, 'tanks', id), {
        name: id,
        product: 'diesel-s10',
        capacityMl: 100000,
        balanceMl: balance,
        active: true,
        version: 0,
        lastOperationId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    await setDoc(ref(db, 'assets', 'A1'), {
      code: 'A1',
      name: 'Máquina',
      plate: '',
      product: 'diesel-s10',
      capacityMl: 80000,
      meter: 'hours',
      readingMilli: 100000,
      active: true,
      version: 0,
      lastOperationId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref(db, 'drivers', 'D1'), { name: 'Motorista', code: 'D1', active: true });
  });
});
test('v2 atomically validates driver, money, clock and idempotent retries', async () => {
  const db = client('operator'),
    c = command();
  await assertSucceeds(execute(db, 'base', 'operator', c));
  await assertSucceeds(execute(db, 'base', 'operator', c));
  const o = (await getDoc(ref(db, 'operations', c.id))).data();
  assert.equal(o.totalCents, 6123);
  assert.equal(o.previousReadingMilli, 100000);
  assert.equal((await getDoc(ref(db, 'tanks', 'T1'))).data().balanceMl, 40000);
  await assert.rejects(
    execute(db, 'base', 'operator', command({ driverId: 'missing' })),
    /Motorista/,
  );
});
test('transfers balance both tanks and reversals restore without deleting history', async () => {
  const db = client('manager'),
    c = command({
      kind: 'transfer',
      destinationTankId: 'T2',
      assetId: '',
      driverId: '',
      readingMilli: 0,
      reference: 'Transferência',
    });
  await assertSucceeds(execute(db, 'base', 'manager', c));
  assert.equal((await getDoc(ref(db, 'tanks', 'T2'))).data().balanceMl, 10000);
  const r = command({
    ...c,
    id: crypto.randomUUID(),
    kind: 'reversal',
    reverses: c.id,
    reference: 'Retorno',
  });
  await assertSucceeds(execute(db, 'base', 'manager', r));
  assert.equal((await getDoc(ref(db, 'tanks', 'T1'))).data().balanceMl, 50000);
  assert.equal((await getDoc(ref(db, 'tanks', 'T2'))).data().balanceMl, 0);
  await assert.rejects(
    execute(db, 'base', 'manager', { ...r, id: crypto.randomUUID() }),
    /estornado/,
  );
});
test('fuel reversal restores previous meter; later fuel cannot be silently overwritten', async () => {
  const db = client('manager'),
    a = command();
  await execute(db, 'base', 'manager', a);
  await assertSucceeds(
    execute(
      db,
      'base',
      'manager',
      command({
        ...a,
        id: crypto.randomUUID(),
        kind: 'reversal',
        reverses: a.id,
        reference: 'Correção',
      }),
    ),
  );
  assert.equal((await getDoc(ref(db, 'assets', 'A1'))).data().readingMilli, 100000);
  const b = command(),
    c = command({ readingMilli: 102000 });
  await execute(db, 'base', 'manager', b);
  await execute(db, 'base', 'manager', c);
  await assert.rejects(
    execute(
      db,
      'base',
      'manager',
      command({
        ...b,
        id: crypto.randomUUID(),
        kind: 'reversal',
        reverses: b.id,
        reference: 'Inválido',
      }),
    ),
    /posteriores/,
  );
});
test('catalog edits paired with immutable audit; balance/meter cannot be edited', async () => {
  const db = client('admin');
  await assertSucceeds(
    saveCatalog(
      db,
      'base',
      'admin',
      'drivers',
      'D2',
      { name: 'Teste', code: 'D2', active: true },
      'Admissão',
    ),
  );
  await assertSucceeds(
    saveCatalog(db, 'base', 'admin', 'drivers', 'D2', { active: false }, 'Desligamento'),
  );
  await assertSucceeds(
    saveCatalog(
      db,
      'base',
      'admin',
      'assets',
      'A1',
      { name: 'Novo nome', capacities: { 'diesel-s10': 80000, arla32: 20000 } },
      'Atualização',
    ),
  );
  await assertFails(
    saveCatalog(db, 'base', 'admin', 'tanks', 'T1', { balanceMl: 90000 }, 'Não permitido'),
  );
  await assertFails(
    saveCatalog(
      client('operator'),
      'base',
      'operator',
      'drivers',
      'D3',
      { name: 'X', code: 'X', active: true },
      'Não permitido',
    ),
  );
  await assertFails(updateDoc(ref(db, 'drivers', 'D2'), { active: true }));
});
test('review and optional photo preserve immutable operation', async () => {
  const db = client('manager'),
    c = command();
  await execute(db, 'base', 'manager', c);
  await assertSucceeds(review(db, 'base', 'manager', c.id, 'validado', 'Conferido'));
  await assertSucceeds(savePhoto(db, 'base', 'manager', c.id, 'data:image/jpeg;base64,YQ=='));
  await assertSucceeds(savePhoto(db, 'base', 'manager', c.id, 'data:image/jpeg;base64,YQ=='));
  await assertFails(
    review(client('operator'), 'base', 'operator', c.id, 'validado', 'Não permitido'),
  );
  await assertFails(setDoc(ref(client('operator'), 'attachments', c.id), { dataUrl: 'x' }));
});
test('closing locks the civil day and validates physical discrepancy', async () => {
  const db = client('manager');
  await execute(db, 'base', 'manager', command());
  await assertSucceeds(closeTank(db, 'base', 'manager', 'T1', 39000, 'Medição física divergente'));
  const c = (await getDoc(ref(db, 'closures', 'T1_' + civilDay()))).data();
  assert.equal(c.differenceMl, -1000);
  assert.equal(c.openingMl, 50000);
  assert.equal(c.outMl, 10000);
  await assert.rejects(execute(db, 'base', 'manager', command()), /fechada/);
});
test('opening only before any movement and only by administrator', async () => {
  const c = command({
    kind: 'opening',
    tankId: 'T2',
    assetId: '',
    driverId: '',
    readingMilli: 0,
    reference: 'Conferência inicial',
  });
  await assertFails(execute(client('manager'), 'base', 'manager', c));
  await assertSucceeds(execute(client('admin'), 'base', 'admin', c));
  await assert.rejects(
    execute(client('admin'), 'base', 'admin', { ...c, id: crypto.randomUUID() }),
    /inicial/,
  );
});
test('malicious complete batches cannot forge amount, day, restored meter or unrelated tank', async () => {
  const db = client('operator');
  for (const change of [
    { totalCents: 1 },
    { businessDate: '2020-01-01' },
    { previousReadingMilli: 0 },
    { restoredReadingMilli: 5 },
    { destinationTankId: 'T2' },
    { createdBy: 'admin' },
  ]) {
    const c = command(),
      { id, ...body } = c,
      b = writeBatch(db);
    b.set(ref(db, 'operations', id), {
      ...body,
      product: 'diesel-s10',
      originalKind: '',
      previousReadingMilli: 100000,
      previousAssetOperationId: '',
      restoredReadingMilli: 0,
      createdBy: 'operator',
      createdAt: serverTimestamp(),
      ...change,
    });
    b.update(ref(db, 'tanks', 'T1'), {
      balanceMl: 40000,
      version: 1,
      lastOperationId: id,
      updatedAt: serverTimestamp(),
    });
    b.update(ref(db, 'assets', 'A1'), {
      readingMilli: 101000,
      version: 1,
      lastOperationId: id,
      lastFuelId: id,
      updatedAt: serverTimestamp(),
    });
    await assertFails(b.commit());
  }
});
test('scoped user management rejects self escalation and other units', async () => {
  const db = client('admin');
  await assertSucceeds(getDocs(query(collection(db, 'users'), where('siteIds', '==', ['base']))));
  const auditId = crypto.randomUUID(),
    target = 'new',
    after = {
      name: 'Novo',
      email: 'novo@example.com',
      role: 'operator',
      active: true,
      siteIds: ['base'],
      auditId,
      updatedAt: serverTimestamp(),
    },
    b = writeBatch(db);
  b.set(doc(db, 'users', target), after);
  b.set(ref(db, 'userAudits', auditId), {
    subjectId: target,
    before: {},
    after,
    reason: 'Admissão',
    createdBy: 'admin',
    createdAt: serverTimestamp(),
  });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(db, 'users', 'admin'), { active: false }));
  await assertFails(getDoc(doc(db, 'users', 'other')));
});
test('manager corrects a pending input once, keeps original and blocks later retry', async () => {
  const original = command({ readingMilli: 99000 }),
    operator = client('operator'),
    manager = client('manager');
  await savePending(operator, 'base', 'operator', {
    id: original.id,
    command: original,
    error: 'Leitura regressiva',
  });
  const corrected = command({
    corrects: original.id,
    reference: 'Leitura conferida',
    readingMilli: 101000,
  });
  await assertSucceeds(execute(manager, 'base', 'manager', corrected));
  assert.equal(
    (await getDoc(ref(manager, 'pending', original.id))).data().payload.readingMilli,
    99000,
  );
  assert.equal(
    (await getDoc(ref(manager, 'resolutions', original.id))).data().operationId,
    corrected.id,
  );
  await assert.rejects(execute(operator, 'base', 'operator', original), /tratada/);
  await assert.rejects(
    dismissPending(operator, 'base', 'operator', original.id, 'Já resolvido'),
    /resolvida/,
  );
});
test('dismissed pending cannot later become a stock movement', async () => {
  const c = command(),
    op = client('operator'),
    manager = client('manager');
  await savePending(op, 'base', 'operator', {
    id: c.id,
    command: c,
    error: 'Confirmar duplicidade',
  });
  await assertFails(dismissPending(op, 'base', 'operator', c.id, 'Não autorizado'));
  await assertSucceeds(
    dismissPending(manager, 'base', 'manager', c.id, 'Duplicidade de apontamento'),
  );
  await assert.rejects(execute(op, 'base', 'operator', c), /tratada/);
  assert.equal((await getDoc(ref(manager, 'tanks', 'T1'))).data().balanceMl, 50000);
});
test('fuel reversals can unwind in reverse order and restore each meter', async () => {
  const db = client('manager'),
    a = command(),
    b = command({ readingMilli: 102000 });
  await execute(db, 'base', 'manager', a);
  await execute(db, 'base', 'manager', b);
  await execute(
    db,
    'base',
    'manager',
    command({
      ...b,
      id: crypto.randomUUID(),
      kind: 'reversal',
      reverses: b.id,
      reference: 'Corrigir segundo',
    }),
  );
  await assertSucceeds(
    execute(
      db,
      'base',
      'manager',
      command({
        ...a,
        id: crypto.randomUUID(),
        kind: 'reversal',
        reverses: a.id,
        reference: 'Corrigir primeiro',
      }),
    ),
  );
  assert.equal((await getDoc(ref(db, 'assets', 'A1'))).data().readingMilli, 100000);
  assert.equal((await getDoc(ref(db, 'tanks', 'T1'))).data().balanceMl, 50000);
});
