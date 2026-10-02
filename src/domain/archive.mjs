// Historical rows deliberately retain their original meaning and do not enter the stock ledger.
const fields = {
  kind: 20,
  businessDate: 10,
  assetId: 100,
  operatorName: 100,
  legacyReading: 100,
  reference: 120,
  unitPriceText: 100,
  totalText: 100,
  product: 40,
  sourceSheet: 100,
  sourceColumn: 3,
};
export const hex = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function normalizeArchiveRow(raw) {
  if (!raw || !hex(raw.id)) throw Error('Identificador histórico inválido.');
  const row = { id: raw.id };
  for (const [key, max] of Object.entries(fields)) {
    if (typeof raw[key] !== 'string' || raw[key].length > max)
      throw Error(`Campo histórico inválido: ${key}.`);
    row[key] = raw[key];
  }
  if (
    !['legacy-in', 'legacy-out'].includes(row.kind) ||
    !['arla32', 'diesel-nao-especificado'].includes(row.product) ||
    !/^[A-Z]{1,3}$/.test(row.sourceColumn) ||
    !row.sourceSheet
  )
    throw Error('Origem ou tipo histórico inválido.');
  const date = new Date(row.businessDate + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(row.businessDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== row.businessDate
  )
    throw Error('Data histórica inválida.');
  for (const key of ['quantityMl', 'sourceRow']) {
    if (!Number.isSafeInteger(raw[key]) || raw[key] <= 0 || raw[key] > 1000000000)
      throw Error(`Número histórico inválido: ${key}.`);
    row[key] = raw[key];
  }
  if (
    !Array.isArray(raw.issues) ||
    raw.issues.length > 10 ||
    raw.issues.some((s) => typeof s !== 'string' || s.length > 500)
  )
    throw Error('Avisos históricos inválidos.');
  row.issues = [...raw.issues];
  return row;
}
export function normalizePackage(raw) {
  if (
    raw?.format !== 'macer-archive-v1' ||
    !hex(raw.sourceHash) ||
    typeof raw.sourceName !== 'string' ||
    !raw.sourceName ||
    raw.sourceName.length > 254 ||
    !Array.isArray(raw.records) ||
    raw.records.length > 20000 ||
    !Array.isArray(raw.catalogs) ||
    raw.catalogs.length > 10000 ||
    !Array.isArray(raw.summary) ||
    !Array.isArray(raw.rejected)
  )
    throw Error('Selecione um pacote de conferência MACER válido.');
  const records = raw.records.map(normalizeArchiveRow);
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw Error('O pacote contém identificadores repetidos. Confira a origem.');
  // Sheet visibility comes from the parser; it only suggests a selection, never grants access.
  const catalogs = raw.catalogs.map((c) => {
    if (
      !c ||
      typeof c.code !== 'string' ||
      !c.code ||
      c.code.length > 100 ||
      !Number.isSafeInteger(c.sourceRow) ||
      c.sourceRow < 1 ||
      !Array.isArray(c.issues) ||
      c.issues.some((s) => typeof s !== 'string' || s.length > 500)
    )
      throw Error('Proposta de cadastro inválida.');
    const out = { sourceRow: c.sourceRow, issues: [...c.issues] };
    for (const key of [
      'code',
      'unit',
      'type',
      'model',
      'plate',
      'owner',
      'ownership',
      'status',
      'sourceSheet',
    ]) {
      if (typeof c[key] !== 'string' || c[key].length > 500)
        throw Error('Texto de cadastro inválido.');
      out[key] = c[key];
    }
    return out;
  });
  const sheets = new Map();
  for (const r of records) {
    if (!sheets.has(r.sourceSheet))
      sheets.set(r.sourceSheet, {
        sheet: r.sourceSheet,
        state:
          raw.summary.find((s) => s.sheet === r.sourceSheet)?.state === 'visible'
            ? 'visible'
            : 'hidden',
        records: 0,
        inMl: 0,
        outMl: 0,
      });
    const s = sheets.get(r.sourceSheet);
    s.records++;
    s[r.kind === 'legacy-in' ? 'inMl' : 'outMl'] += r.quantityMl;
  }
  const rejected = raw.rejected.map((r) => {
    if (
      !r ||
      typeof r.sourceSheet !== 'string' ||
      !Number.isSafeInteger(r.sourceRow) ||
      typeof r.sourceColumn !== 'string' ||
      typeof r.reason !== 'string'
    )
      throw Error('Linha rejeitada inválida.');
    return {
      sourceSheet: r.sourceSheet,
      sourceRow: r.sourceRow,
      sourceColumn: r.sourceColumn,
      reason: r.reason,
    };
  });
  return {
    format: raw.format,
    sourceName: raw.sourceName,
    sourceHash: raw.sourceHash,
    records,
    catalogs,
    rejected,
    summary: [...sheets.values()],
  };
}
export const canonicalRow = (row) => JSON.stringify(normalizeArchiveRow(row));
export async function rowHash(row) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRow(row)));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function sameArchivedRow(stored, candidate) {
  return canonicalRow(stored) === canonicalRow(candidate);
}
