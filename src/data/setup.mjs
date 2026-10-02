import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { allDocs, execute } from './ledger.mjs';
const ref = (db, site, group, id) => doc(db, 'sites', site, group, id);
export function unitValues(raw) {
  const out = {};
  for (const [key, max] of [
    ['name', 100],
    ['responsibleName', 100],
    ['responsibleEmail', 254],
  ]) {
    out[key] = String(raw[key] || '').trim();
    if (!out[key] || out[key].length > max)
      throw Error('Informe unidade e responsável dentro dos limites.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.responsibleEmail))
    throw Error('Informe um e-mail válido para o responsável.');
  out.crs = [
    ...new Set(
      String(raw.crs || '')
        .split(/[,;\n]/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (!out.crs.length || out.crs.length > 20 || out.crs.some((c) => !/^[A-Z0-9-]{1,40}$/.test(c)))
    throw Error('Informe de 1 a 20 CRs, separados por vírgula, usando letras, números e hífen.');
  return out;
}
export async function saveUnit(db, site, uid, raw, create = false) {
  const values = unitValues(raw);
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(site)) throw Error('Código da unidade inválido.');
  const auditId = crypto.randomUUID(),
    unitRef = doc(db, 'sites', site),
    profileRef = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    const profile = await tx.get(profileRef);
    const p = profile.data();
    if (!p?.active || p.role !== 'admin')
      throw Error('Somente administrador ativo pode preparar unidades.');
    if (create && p.canCreateSites !== true)
      throw Error('Nova unidade exige o administrador principal.');
    const previous = await tx.get(unitRef);
    if (create && (p.canCreateSites !== true || previous.exists() || p.siteIds.includes(site)))
      throw Error('Nova unidade exige o administrador principal e um código ainda não utilizado.');
    if (!create && !p.siteIds.includes(site)) throw Error('Unidade fora do seu acesso.');
    const before = previous.data() || {};
    const after = {
      ...before,
      ...values,
      checks: before.checks || { assets: false, drivers: false, users: false },
      ownerUid: before.ownerUid || uid,
      createdAt: before.createdAt || serverTimestamp(),
      createdBy: before.createdBy || uid,
      updatedAt: serverTimestamp(),
      auditId,
    };
    tx.set(unitRef, after);
    tx.set(ref(db, site, 'unitAudits', auditId), {
      before,
      after,
      reason: create ? 'Cadastro de nova unidade' : 'Dados da unidade e responsável conferidos',
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    if (create)
      tx.update(profileRef, {
        siteIds: [...p.siteIds, site],
        unitGrantId: site,
        updatedAt: serverTimestamp(),
      });
  });
}
export async function saveChecks(db, site, uid, checks) {
  if (['assets', 'drivers', 'users'].some((k) => typeof checks[k] !== 'boolean'))
    throw Error('Conferência inválida.');
  const unitRef = doc(db, 'sites', site),
    auditId = crypto.randomUUID();
  await runTransaction(db, async (tx) => {
    const before = (await tx.get(unitRef)).data();
    if (!before) throw Error('Salve primeiro os dados da unidade.');
    const after = {
      ...before,
      checks: { assets: checks.assets, drivers: checks.drivers, users: checks.users },
      auditId,
      updatedAt: serverTimestamp(),
    };
    tx.set(unitRef, after);
    tx.set(ref(db, site, 'unitAudits', auditId), {
      before,
      after,
      reason: 'Conferência dos cadastros para início de operação',
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  });
}
export async function loadSetup(db, site) {
  const [unit, measurements, openings] = await Promise.all([
    getDoc(doc(db, 'sites', site)),
    allDocs(db, site, 'measurements', '', 'admin'),
    allDocs(db, site, 'openingMeasurements', '', 'admin'),
  ]);
  return { unit: unit.data() || null, measurements, openings };
}
export function normalizeMeasurement(raw, now = Date.now()) {
  const value = {
    id: raw.id || crypto.randomUUID(),
    tankId: String(raw.tankId || ''),
    physicalMl: raw.physicalMl,
    measuredAtMs: raw.measuredAtMs,
    measuredByName: String(raw.measuredByName || '').trim(),
    reference: String(raw.reference || '').trim(),
    noMovementsSince: raw.noMovementsSince === true,
  };
  if (
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    !value.tankId ||
    value.tankId.includes('/') ||
    value.tankId.length > 100 ||
    !Number.isSafeInteger(value.physicalMl) ||
    value.physicalMl < 0 ||
    value.physicalMl > 1e9
  )
    throw Error('Informe tanque e saldo físico válido; zero é permitido.');
  if (
    !Number.isSafeInteger(value.measuredAtMs) ||
    value.measuredAtMs > now + 300000 ||
    value.measuredAtMs < now - 30 * 86400000
  )
    throw Error('Informe uma medição dos últimos 30 dias, sem data futura.');
  if (
    !value.measuredByName ||
    value.measuredByName.length > 100 ||
    !value.reference ||
    value.reference.length > 120
  )
    throw Error('Informe quem mediu e a referência da medição.');
  return value;
}
export async function saveMeasurement(db, site, uid, raw) {
  const { id, ...values } = normalizeMeasurement(raw),
    target = ref(db, site, 'measurements', id);
  await runTransaction(db, async (tx) => {
    const previous = await tx.get(target),
      tank = await tx.get(ref(db, site, 'tanks', values.tankId));
    if (previous.exists()) {
      if (
        previous.data().createdBy !== uid ||
        Object.entries(values).some(([k, v]) => previous.data()[k] !== v)
      )
        throw Error('Medição já registrada com outros valores.');
      return;
    }
    const t = tank.data();
    if (!t?.active || values.physicalMl > t.capacityMl)
      throw Error('Tanque inativo ou medição acima da capacidade.');
    tx.set(target, {
      ...values,
      capacityMl: t.capacityMl,
      product: t.product,
      tankVersion: t.version,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
  });
  return id;
}
export async function openFromMeasurement(db, site, uid, measurement) {
  if ((await getDoc(ref(db, site, 'openingMeasurements', measurement.id))).exists()) return;
  if (measurement.physicalMl === 0) {
    const marker = ref(db, site, 'openingMeasurements', measurement.id);
    await runTransaction(db, async (tx) => {
      if ((await tx.get(marker)).exists()) return;
      const m = (await tx.get(ref(db, site, 'measurements', measurement.id))).data();
      const t = (await tx.get(ref(db, site, 'tanks', measurement.tankId))).data();
      if (
        !m ||
        m.physicalMl !== 0 ||
        !m.noMovementsSince ||
        !t?.active ||
        t.version !== 0 ||
        t.balanceMl !== 0
      )
        throw Error('Confirmação de saldo zero exige tanque sem movimentos e medição conferida.');
      tx.set(marker, {
        operationId: '',
        tankId: m.tankId,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
      tx.update(ref(db, site, 'tanks', m.tankId), {
        version: t.version + 1,
        lastOperationId: measurement.id,
        updatedAt: serverTimestamp(),
      });
    });
    return;
  }
  await execute(db, site, uid, {
    id: measurement.id,
    kind: 'opening',
    tankId: measurement.tankId,
    quantityMl: measurement.physicalMl,
    measurementId: measurement.id,
    reference: `Medição ${measurement.reference}`.slice(0, 120),
    capturedAtMs: measurement.createdAt?.toMillis?.() || measurement.createdAt?.milliseconds,
    note: `Saldo físico conferido por ${measurement.measuredByName}.`,
  });
}
