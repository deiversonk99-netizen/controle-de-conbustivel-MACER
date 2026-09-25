import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { submitOperation } from '../../src/data/operations.mjs';
let env;
const projectId = 'demo-macer';
const path = (db, name, id) => doc(db, 'sites', 'base', name, id);
const client = uid => env.authenticatedContext(uid).firestore();
const command = (changes = {}) => ({ id: crypto.randomUUID(), kind: 'fuel', tankId: 'T1', assetId: 'A1', quantityMl: 10000, readingMilli: 101000, reference: '', note: '', ...changes });
before(async () => { env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, role, active, siteIds] of [['admin','admin',true,['base']],['manager','manager',true,['base']],['operator','operator',true,['base']],['other','operator',true,['other']],['inactive','operator',false,['base']]]) {
      await setDoc(doc(db,'users',id), { name: id, role, active, siteIds });
    }
    await setDoc(path(db,'tanks','T1'), { name:'Tanque teste', product:'diesel-s10', capacityMl:100000, balanceMl:50000, active:true, version:0, lastOperationId:'', createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
    await setDoc(path(db,'assets','A1'), { code:'A1', name:'Ativo teste', plate:'', product:'diesel-s10', capacityMl:80000, meter:'hours', readingMilli:100000, active:true, version:0, lastOperationId:'', createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  });
});
test('abastecimento grava movimento, saldo e medidor atomicamente; reenvio não duplica', async () => {
  const db=client('operator'), c=command();
  await assertSucceeds(submitOperation(db,'base','operator',c));
  await assertSucceeds(submitOperation(db,'base','operator',c));
  assert.equal((await getDoc(path(db,'tanks','T1'))).data().balanceMl,40000);
  assert.equal((await getDoc(path(db,'assets','A1'))).data().readingMilli,101000);
  await assert.rejects(submitOperation(db,'base','operator',{...c,quantityMl:20000}),/Identificador/);
});
test('recebimento autorizado e capacidade respeitada', async () => {
  const db=client('manager');
  await assertSucceeds(submitOperation(db,'base','manager',command({kind:'receipt',assetId:'',readingMilli:0,reference:'NF TESTE'})));
  assert.equal((await getDoc(path(db,'tanks','T1'))).data().balanceMl,60000);
  await assertFails(submitOperation(client('operator'),'base','operator',command({kind:'receipt',assetId:'',readingMilli:0,reference:'NF TESTE'})));
  await assert.rejects(submitOperation(db,'base','manager',command({kind:'receipt',assetId:'',readingMilli:0,reference:'NF TESTE',quantityMl:50000})),/capacidade/);
});
test('concorrência não permite duas retiradas que excedem saldo', async () => {
  const db=client('operator');
  const results=await Promise.allSettled([submitOperation(db,'base','operator',command({quantityMl:40000})),submitOperation(db,'base','operator',command({quantityMl:40000}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await getDoc(path(db,'tanks','T1'))).data().balanceMl,10000);
});
test('nega escrita isolada, promoção de perfil, usuário inativo e fora do escopo', async () => {
  const db=client('operator');
  await assertFails(updateDoc(path(db,'tanks','T1'),{balanceMl:90000}));
  await assertFails(updateDoc(path(db,'assets','A1'),{readingMilli:0}));
  await assertFails(updateDoc(doc(db,'users','operator'),{role:'admin'}));
  for (const uid of ['other','inactive']) await assertFails(getDoc(path(client(uid),'tanks','T1')));
  await assertFails(getDoc(path(env.unauthenticatedContext().firestore(),'tanks','T1')));
});
test('histórico imutável e comboísta consulta somente seus registros', async () => {
  const db=client('manager'), c=command();
  await submitOperation(db,'base','manager',c);
  await assertFails(updateDoc(path(db,'operations',c.id),{note:'alterado'}));
  await assertFails(deleteDoc(path(db,'operations',c.id)));
  await assertFails(getDoc(path(client('operator'),'operations',c.id)));
  await assertFails(getDocs(collection(client('operator'),'sites','base','operations')));
  await assertSucceeds(getDocs(query(collection(client('operator'),'sites','base','operations'),where('createdBy','==','operator'))));
});
test('regras barram cliente adulterado: saldo sem medidor, produto e autor falsos, quantidade negativa', async () => {
  const db=client('operator');
  for (const changes of [{},{product:'arla32'},{createdBy:'manager'},{quantityMl:-10000}]) {
    const id=crypto.randomUUID(), batch=writeBatch(db);
    batch.set(path(db,'operations',id),{kind:'fuel',tankId:'T1',assetId:'A1',product:'diesel-s10',quantityMl:10000,readingMilli:101000,reference:'',note:'',createdBy:'operator',createdAt:serverTimestamp(),...changes});
    batch.update(path(db,'tanks','T1'),{balanceMl:40000,version:1,lastOperationId:id,updatedAt:serverTimestamp()});
    await assertFails(batch.commit());
  }
});
test('não permite reaplicar operação existente como nova baixa', async () => {
  const db=client('operator'), c=command(); await submitOperation(db,'base','operator',c);
  await assertFails(updateDoc(path(db,'tanks','T1'),{balanceMl:30000,version:2,lastOperationId:c.id,updatedAt:serverTimestamp()}));
});
test('cadastros restritos ao administrador, tanque nasce zerado', async()=> {
  const tank={name:'Novo',product:'diesel-s10',capacityMl:500000,balanceMl:0,active:true,version:0,lastOperationId:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(path(client('admin'),'tanks','T2'),tank));
  await assertFails(setDoc(path(client('manager'),'tanks','T3'),tank));
  await assertFails(setDoc(path(client('admin'),'tanks','T4'),{...tank,balanceMl:1000}));
});
test('lote completo adulterado é rejeitado pelas regras, sem depender da validação da interface',async()=> {
  const db=client('operator');
  for(const changes of [{quantityMl:-1000},{quantityMl:60000},{quantityMl:0},{readingMilli:99000},{product:'arla32'},{createdBy:'manager'},{extra:'não permitido'}]) {
    const id=crypto.randomUUID();
    const op={kind:'fuel',tankId:'T1',assetId:'A1',product:'diesel-s10',quantityMl:10000,readingMilli:101000,reference:'',note:'',createdBy:'operator',createdAt:serverTimestamp(),...changes};
    const batch=writeBatch(db);
    batch.set(path(db,'operations',id),op);
    batch.update(path(db,'tanks','T1'),{balanceMl:50000-op.quantityMl,version:1,lastOperationId:id,updatedAt:serverTimestamp()});
    batch.update(path(db,'assets','A1'),{readingMilli:op.readingMilli,version:1,lastOperationId:id,updatedAt:serverTimestamp()});
    await assertFails(batch.commit());
  }
  assert.equal((await getDoc(path(db,'tanks','T1'))).data().balanceMl,50000);
});
