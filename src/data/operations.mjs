import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

/** O documento de operação é também o movimento imutável do estoque nesta etapa. */
export async function submitOperation(db, siteId, uid, command) {
  if (!siteId || siteId.includes('/')) throw new Error('Unidade inválida.');
  if (!command.id || command.id.length !== 36) throw new Error('Identificador inválido.');
  if (!['fuel', 'receipt'].includes(command.kind)) throw new Error('Operação inválida.');
  if (!Number.isSafeInteger(command.quantityMl) || command.quantityMl <= 0) throw new Error('Quantidade inválida.');
  const opRef = doc(db, 'sites', siteId, 'operations', command.id);
  const tankRef = doc(db, 'sites', siteId, 'tanks', command.tankId);
  return runTransaction(db, async tx => {
    const previous = await tx.get(opRef);
    if (previous.exists()) {
      const p = previous.data();
      const same = p.createdBy === uid && ['kind','tankId','assetId','quantityMl','readingMilli','reference','note'].every(k => p[k] === command[k]);
      if (!same) throw new Error('Identificador já utilizado por outra operação.');
      return command.id;
    }
    const tankSnap = await tx.get(tankRef);
    if (!tankSnap.exists() || !tankSnap.data().active) throw new Error('Tanque indisponível.');
    const tank = tankSnap.data();
    const balance = tank.balanceMl + (command.kind === 'receipt' ? command.quantityMl : -command.quantityMl);
    if (balance < 0) throw new Error('Saldo insuficiente.');
    if (balance > tank.capacityMl) throw new Error('Entrada ultrapassa a capacidade do tanque.');
    let assetRef;
    let asset;
    if (command.kind === 'fuel') {
      assetRef = doc(db, 'sites', siteId, 'assets', command.assetId);
      const snapshot = await tx.get(assetRef);
      if (!snapshot.exists() || !snapshot.data().active) throw new Error('Ativo indisponível.');
      asset = snapshot.data();
      if (asset.product !== tank.product) throw new Error('Produto incompatível com o ativo.');
      if (command.quantityMl > asset.capacityMl) throw new Error('Quantidade excede a capacidade do ativo.');
      if (!Number.isSafeInteger(command.readingMilli) || command.readingMilli < asset.readingMilli) throw new Error('Leitura menor que a última registrada.');
    }
    tx.set(opRef, {
      kind: command.kind, tankId: command.tankId, assetId: command.assetId,
      product: tank.product, quantityMl: command.quantityMl, readingMilli: command.readingMilli,
      reference: command.reference, note: command.note, createdBy: uid, createdAt: serverTimestamp(),
    });
    tx.update(tankRef, { balanceMl: balance, version: tank.version + 1, lastOperationId: command.id, updatedAt: serverTimestamp() });
    if (assetRef && asset) tx.update(assetRef, {
      readingMilli: command.readingMilli, version: asset.version + 1, lastOperationId: command.id, updatedAt: serverTimestamp(),
    });
    return command.id;
  });
}
