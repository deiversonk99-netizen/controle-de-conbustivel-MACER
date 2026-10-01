import {
  doc,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  getDoc,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { normalizeCommand, deltaFor, civilDay } from '../domain/business.mjs';
const ref = (db, site, group, id) => doc(db, 'sites', site, group, id);
export async function allDocs(db, site, group, uid, role) {
  const out = [];
  let cursor;
  do {
    const constraints = [
      ...(role === 'operator' && ['operations', 'pending', 'resolutions'].includes(group)
        ? [where(group === 'resolutions' ? 'originalCreatedBy' : 'createdBy', '==', uid)]
        : []),
      orderBy('__name__'),
      limit(300),
      ...(cursor ? [startAfter(cursor)] : []),
    ];
    const page = await getDocs(query(collection(db, 'sites', site, group), ...constraints));
    out.push(...page.docs.map((d) => ({ ...d.data(), id: d.id })));
    cursor = page.size === 300 ? page.docs.at(-1) : null;
  } while (cursor);
  return out;
}
export async function execute(db, site, uid, raw) {
  const c = normalizeCommand(raw),
    opRef = ref(db, site, 'operations', c.id),
    tankRef = ref(db, site, 'tanks', c.tankId);
  return runTransaction(db, async (tx) => {
    const previous = await tx.get(opRef);
    if (previous.exists()) {
      const p = previous.data();
      if (p.createdBy !== uid || Object.entries(c).some(([k, v]) => k !== 'id' && p[k] !== v))
        throw Error('Identificador já confirmado com outros dados.');
      return c.id;
    }
    if ((await tx.get(ref(db, site, 'resolutions', c.id))).exists())
      throw Error('Pendência já tratada pelo responsável. Atualize a fila.');
    let correction = null;
    if (c.corrects) {
      const rejected = await tx.get(ref(db, site, 'pending', c.corrects)),
        resolution = await tx.get(ref(db, site, 'resolutions', c.corrects)),
        confirmed = await tx.get(ref(db, site, 'operations', c.corrects));
      if (!rejected.exists() || resolution.exists() || confirmed.exists())
        throw Error('Pendência inexistente, resolvida ou já confirmada.');
      correction = rejected.data();
      if (!c.reference.trim()) throw Error('Justifique a correção.');
    }
    const tankSnap = await tx.get(tankRef);
    if (!tankSnap.exists() || !tankSnap.data().active)
      throw Error('Tanque inativo ou inexistente.');
    const tank = tankSnap.data();
    if (c.businessDate <= (tank.closedThrough || ''))
      throw Error('Data já fechada. Solicite tratamento ao responsável.');
    if (c.capturedAtMs > Date.now() + 300000 || c.capturedAtMs < Date.now() - 30 * 86400000)
      throw Error('Relógio/data fora da janela de 30 dias. Confira o aparelho.');
    let original = null,
      asset = null,
      assetRef = null,
      destination = null,
      destinationRef = null,
      marker = null;
    if (c.kind === 'reversal') {
      const orig = await tx.get(ref(db, site, 'operations', c.reverses));
      marker = ref(db, site, 'reversals', c.reverses);
      if (!orig.exists() || (await tx.get(marker)).exists())
        throw Error('Registro ausente ou já estornado.');
      original = orig.data();
      if (original.schema !== 2 || original.kind === 'reversal')
        throw Error('Este registro não admite estorno automático.');
      for (const k of [
        'tankId',
        'destinationTankId',
        'assetId',
        'driverId',
        'quantityMl',
        'readingMilli',
        'unitPriceMicros',
      ])
        if (c[k] !== original[k]) throw Error('Estorno deve reproduzir os valores originais.');
    }
    const kind = original?.kind || c.kind;
    if (kind === 'fuel') {
      assetRef = ref(db, site, 'assets', c.assetId);
      const s = await tx.get(assetRef);
      if (!s.exists()) throw Error('Ativo não encontrado.');
      asset = s.data();
      if (!original) {
        if (!asset.active) throw Error('Ativo inativo.');
        const capacity =
          (asset.capacities || {})[tank.product] ??
          (asset.product === tank.product ? asset.capacityMl : 0);
        if (!capacity || c.quantityMl > capacity)
          throw Error('Produto ou quantidade incompatível com a capacidade do ativo.');
        if (c.readingMilli < asset.readingMilli)
          throw Error('Leitura inferior à última confirmada.');
        if (c.driverId) {
          const driver = await tx.get(ref(db, site, 'drivers', c.driverId));
          if (!driver.exists() || !driver.data().active)
            throw Error('Motorista inativo ou inexistente.');
        }
      } else if ((asset.lastFuelId ?? asset.lastOperationId) !== c.reverses)
        throw Error(
          'Há abastecimentos posteriores. Estorne em ordem inversa para preservar o medidor.',
        );
    }
    if (kind === 'transfer') {
      destinationRef = ref(db, site, 'tanks', c.destinationTankId);
      const s = await tx.get(destinationRef);
      if (!s.exists() || !s.data().active) throw Error('Destino indisponível.');
      destination = s.data();
      if (destination.product !== tank.product)
        throw Error('Tanques precisam conter o mesmo produto.');
      if (c.businessDate <= (destination.closedThrough || ''))
        throw Error('Destino já fechado nesta data.');
    }
    if (c.kind === 'opening' && (tank.version !== 0 || tank.balanceMl !== 0))
      throw Error('Saldo inicial permitido somente em tanque sem movimentos.');
    const { id, ...body } = c;
    const operation = {
      ...body,
      product: tank.product,
      originalKind: original?.kind || '',
      previousReadingMilli: asset?.readingMilli || 0,
      previousAssetOperationId: asset ? (asset.lastFuelId ?? asset.lastOperationId) : '',
      restoredReadingMilli: original?.previousReadingMilli || 0,
      createdBy: uid,
      createdAt: serverTimestamp(),
    };
    const balance = tank.balanceMl + deltaFor(operation, c.tankId);
    if (balance < 0 || balance > tank.capacityMl)
      throw Error('Saldo insuficiente ou capacidade do tanque excedida.');
    const destBalance = destination
      ? destination.balanceMl + deltaFor(operation, c.destinationTankId)
      : 0;
    if (destination && (destBalance < 0 || destBalance > destination.capacityMl))
      throw Error('Saldo/capacidade do destino inválido.');
    tx.set(opRef, operation);
    tx.update(tankRef, {
      balanceMl: balance,
      version: tank.version + 1,
      lastOperationId: id,
      updatedAt: serverTimestamp(),
    });
    if (destination)
      tx.update(destinationRef, {
        balanceMl: destBalance,
        version: destination.version + 1,
        lastOperationId: id,
        updatedAt: serverTimestamp(),
      });
    if (asset)
      tx.update(assetRef, {
        readingMilli: original ? original.previousReadingMilli : c.readingMilli,
        lastFuelId: original ? original.previousAssetOperationId : id,
        version: asset.version + 1,
        lastOperationId: id,
        updatedAt: serverTimestamp(),
      });
    if (marker)
      tx.set(marker, {
        operationId: id,
        createdBy: uid,
        createdAt: serverTimestamp(),
        reason: c.reference,
      });
    if (correction)
      tx.set(ref(db, site, 'resolutions', c.corrects), {
        outcome: 'corrected',
        operationId: id,
        originalCreatedBy: correction.createdBy,
        reason: c.reference,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
    return id;
  });
}
export async function dismissPending(db, site, uid, id, reason) {
  if (!reason.trim()) throw Error('Informe o motivo.');
  await runTransaction(db, async (tx) => {
    const p = await tx.get(ref(db, site, 'pending', id)),
      r = ref(db, site, 'resolutions', id),
      s = await tx.get(r),
      op = await tx.get(ref(db, site, 'operations', id));
    if (!p.exists() || s.exists() || op.exists())
      throw Error('Pendência inexistente, resolvida ou já confirmada.');
    tx.set(r, {
      outcome: 'dismissed',
      operationId: '',
      originalCreatedBy: p.data().createdBy,
      reason,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  });
}
export async function savePhoto(db, site, uid, id, dataUrl) {
  await runTransaction(db, async (tx) => {
    const r = ref(db, site, 'attachments', id),
      s = await tx.get(r);
    if (s.exists()) {
      if (s.data().dataUrl !== dataUrl) throw Error('Comprovante já anexado.');
      return;
    }
    tx.set(r, { dataUrl, createdBy: uid, operationId: id, createdAt: serverTimestamp() });
  });
}
export async function savePending(db, site, uid, item) {
  await runTransaction(db, async (tx) => {
    const r = ref(db, site, 'pending', item.id),
      previous = await tx.get(r);
    if (previous.exists()) return;
    tx.set(r, {
      createdBy: uid,
      payload: item.command,
      error: item.error || '',
      status: 'pendente',
      updatedAt: serverTimestamp(),
    });
  });
}
export async function saveCatalog(db, site, uid, group, id, values, reason, mustCreate = false) {
  if (!reason.trim()) throw Error('Informe o motivo.');
  return runTransaction(db, async (tx) => {
    const r = ref(db, site, group, id),
      s = await tx.get(r),
      before = s.exists() ? s.data() : null;
    if (mustCreate && before)
      throw Error('Código já cadastrado por outro usuário. Atualize e confira.');
    const after = before
      ? { ...before, ...values, updatedAt: serverTimestamp() }
      : {
          ...values,
          ...(group === 'drivers' ? {} : { version: 0, lastOperationId: '' }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
    const auditId = crypto.randomUUID();
    after.auditId = auditId;
    tx.set(r, after);
    tx.set(ref(db, site, 'audits', auditId), {
      group,
      subjectId: id,
      before: before || {},
      after,
      reason,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  });
}
export async function review(db, site, uid, id, status, reason) {
  if (!reason.trim()) throw Error('Informe o motivo da conferência.');
  return runTransaction(db, async (tx) => {
    const target = ref(db, site, 'reviews', id),
      s = await tx.get(target),
      op = await tx.get(ref(db, site, 'operations', id));
    if (!op.exists()) throw Error('Registro inexistente.');
    const after = {
      status,
      reason,
      createdBy: uid,
      updatedAt: serverTimestamp(),
      auditId: crypto.randomUUID(),
    };
    tx.set(target, after);
    tx.set(ref(db, site, 'audits', after.auditId), {
      group: 'reviews',
      subjectId: id,
      before: s.data() || {},
      after,
      reason,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  });
}
export async function closeTank(db, site, uid, tankId, physicalMl, reason) {
  const day = civilDay(),
    r = ref(db, site, 'tanks', tankId),
    first = await getDoc(r);
  if (!first.exists()) throw Error('Tanque inexistente.');
  const history = await allDocs(db, site, 'operations', uid, 'manager');
  const daily = history.filter((o) => (o.businessDate || civilDay(o.createdAt.toMillis())) === day);
  const net = daily.reduce((sum, o) => sum + deltaFor(o, tankId), 0);
  const id = tankId + '_' + day;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(r),
      tank = snap.data(),
      closure = await tx.get(ref(db, site, 'closures', id));
    if (closure.exists()) throw Error('Tanque já fechado hoje.');
    if (tank.version !== first.data().version)
      throw Error('Estoque mudou durante a conferência. Atualize e tente novamente.');
    if (!Number.isSafeInteger(physicalMl) || physicalMl < 0 || physicalMl > tank.capacityMl)
      throw Error('Saldo físico inválido.');
    if (physicalMl !== tank.balanceMl && !reason.trim())
      throw Error('Informe o motivo da divergência.');
    const changes = daily.map((o) => deltaFor(o, tankId));
    tx.set(ref(db, site, 'closures', id), {
      tankId,
      day,
      openingMl: tank.balanceMl - net,
      inMl: changes.filter((v) => v > 0).reduce((a, b) => a + b, 0),
      outMl: -changes.filter((v) => v < 0).reduce((a, b) => a + b, 0),
      balanceMl: tank.balanceMl,
      physicalMl,
      differenceMl: physicalMl - tank.balanceMl,
      status: physicalMl === tank.balanceMl ? 'OK' : 'DIVERGENCIA',
      reason,
      createdBy: uid,
      createdAt: serverTimestamp(),
      version: tank.version,
    });
    tx.update(r, { closedThrough: day, closureId: id, updatedAt: serverTimestamp() });
  });
  return id;
}
