import { competencia } from './competencia.mjs';
export const civilDay = (ms = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
export const periodOf = (op) =>
  competencia(
    op.businessDate || civilDay(op.createdAt?.toMillis?.() || op.capturedAtMs || Date.now()),
  );
export const amountCents = (ml, priceMicros) =>
  Number((BigInt(ml) * BigInt(priceMicros) + 5000000n) / 10000000n);
export const effectiveStatus = (op, reviews = {}, reversals = {}) =>
  reversals[op.id] ? 'cancelado' : reviews[op.id]?.status || 'registrado';
export function normalizeCommand(raw) {
  const c = {
    schema: 2,
    kind: raw.kind,
    tankId: raw.tankId,
    destinationTankId: raw.destinationTankId || '',
    assetId: raw.assetId || '',
    driverId: raw.driverId || '',
    quantityMl: raw.quantityMl,
    readingMilli: raw.readingMilli || 0,
    unitPriceMicros: raw.unitPriceMicros || 0,
    reference: raw.reference || '',
    note: raw.note || '',
    capturedAtMs: raw.capturedAtMs || Date.now(),
    reverses: raw.reverses || '',
  };
  c.corrects = raw.corrects || '';
  if (raw.measurementId) {
    if (
      raw.kind !== 'opening' ||
      typeof raw.measurementId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(raw.measurementId)
    )
      throw Error('Medição de abertura inválida.');
    c.measurementId = raw.measurementId;
  }
  if (!['fuel', 'receipt', 'transfer', 'opening', 'reversal'].includes(c.kind))
    throw Error('Tipo inválido.');
  if (!Number.isSafeInteger(c.quantityMl) || c.quantityMl <= 0 || c.quantityMl > 1e9)
    throw Error('Informe litros positivos dentro do limite.');
  if (!Number.isSafeInteger(c.unitPriceMicros) || c.unitPriceMicros < 0 || c.unitPriceMicros > 1e9)
    throw Error('Preço inválido.');
  if (!Number.isSafeInteger(c.readingMilli) || c.readingMilli < 0 || c.readingMilli > 1e12)
    throw Error('Leitura inválida.');
  if (!Number.isSafeInteger(c.capturedAtMs) || !Number.isFinite(new Date(c.capturedAtMs).getTime()))
    throw Error('Data inválida.');
  for (const k of ['tankId', 'destinationTankId', 'assetId', 'driverId', 'reverses', 'corrects'])
    if (typeof c[k] !== 'string' || c[k].includes('/') || c[k].length > 100)
      throw Error('Cadastro inválido.');
  if (!c.tankId || (c.kind === 'fuel' && !c.assetId)) throw Error('Selecione os cadastros.');
  if (c.kind === 'transfer' && (!c.destinationTankId || c.destinationTankId === c.tankId))
    throw Error('Selecione outro tanque de destino.');
  if (
    typeof c.reference !== 'string' ||
    typeof c.note !== 'string' ||
    c.reference.length > 120 ||
    c.note.length > 500
  )
    throw Error('Texto inválido ou acima do limite.');
  if (['receipt', 'opening', 'transfer', 'reversal'].includes(c.kind) && !c.reference.trim())
    throw Error('Informe documento ou motivo.');
  c.businessDate = civilDay(c.capturedAtMs);
  c.totalCents = amountCents(c.quantityMl, c.unitPriceMicros);
  return { id: raw.id || crypto.randomUUID(), ...c };
}
export function deltaFor(op, tankId) {
  const sign = op.kind === 'reversal' ? -1 : 1,
    kind = op.kind === 'reversal' ? op.originalKind : op.kind;
  if (kind === 'transfer')
    return (
      sign *
      (op.destinationTankId === tankId ? op.quantityMl : op.tankId === tankId ? -op.quantityMl : 0)
    );
  return op.tankId === tankId ? sign * (kind === 'fuel' ? -op.quantityMl : op.quantityMl) : 0;
}
export function csv(rows) {
  const safe = (v) => {
    const t = String(v ?? '');
    return '"' + (/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replaceAll('"', '""') + '"';
  };
  return '\ufeff' + rows.map((r) => r.map(safe).join(';')).join('\r\n');
}
