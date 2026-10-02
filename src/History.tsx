import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getDatabase } from './firebase';
import { productName } from './data/catalog';
import { review } from './data/ledger.mjs';
import { normalizeCommand, periodOf, effectiveStatus, csv, civilDay } from './domain/business.mjs';
import { formatMilli } from './domain/quantity.mjs';
import { Field, day, names, money, download, type Row } from './ui';
type Props = {
  data: Record<string, Row[]>;
  site: string;
  uid: string;
  manager: boolean;
  online: boolean;
  busy: boolean;
  more: boolean;
  load: (full?: boolean) => Promise<void>;
  action: (work: () => Promise<unknown>, message?: string, reload?: boolean) => Promise<void>;
  enqueue: (c: any, image?: string) => Promise<void>;
  compact?: boolean;
};
export default function History({
  data,
  site,
  uid,
  manager,
  online,
  busy,
  more,
  load,
  action,
  enqueue,
  compact = false,
}: Props) {
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [vehicle, setVehicle] = useState(''),
    [author, setAuthor] = useState(''),
    [status, setStatus] = useState(''),
    [month, setMonth] = useState(''),
    [detail, setDetail] = useState<Row | null>(null),
    [photo, setPhoto] = useState('');
  const reviews = Object.fromEntries(data.reviews.map((r) => [r.id, r])),
    reversals = Object.fromEntries(data.reversals.map((r) => [r.id, r]));
  const filtered = data.history
    .filter(
      (o) =>
        (!start || day(o) >= start) &&
        (!end || day(o) <= end) &&
        (!vehicle || o.assetId === vehicle) &&
        (!author || o.createdBy === author) &&
        (!status || effectiveStatus(o, reviews, reversals) === status) &&
        (!month || periodOf({ ...o, businessDate: day(o) }) === month),
    )
    .sort(
      (a, b) =>
        (b.capturedAtMs || b.createdAt?.milliseconds || 0) -
        (a.capturedAtMs || a.createdAt?.milliseconds || 0),
    );
  function exportHistory() {
    download(
      `MACER-${site}-${civilDay()}.csv`,
      csv([
        [
          'Protocolo',
          'Data operacional',
          'Capturado no aparelho',
          'Confirmado no servidor',
          'Competência',
          'Tipo',
          'Tanque',
          'Destino',
          'Ativo',
          'Motorista',
          'Usuário',
          'Produto',
          'Litros',
          'Leitura',
          'Medidor',
          'Preço/L',
          'Total R$',
          'NF/referência',
          'Observação',
          'Status',
        ],
        ...filtered.map((o) => [
          o.id,
          day(o),
          o.capturedAtMs ? new Date(o.capturedAtMs).toISOString() : '',
          o.createdAt?.milliseconds ? new Date(o.createdAt.milliseconds).toISOString() : '',
          periodOf({ ...o, businessDate: day(o) }),
          names[o.kind],
          o.tankId,
          o.destinationTankId,
          o.assetId,
          data.drivers.find((d) => d.id === o.driverId)?.name || o.driverId,
          o.createdBy,
          productName(o.product),
          (o.quantityMl / 1000).toFixed(3).replace('.', ','),
          (o.readingMilli / 1000).toFixed(3).replace('.', ','),
          data.assets.find((a) => a.id === o.assetId)?.meter || '',
          (o.unitPriceMicros / 1e6 || 0).toFixed(6).replace('.', ','),
          (o.totalCents / 100 || 0).toFixed(2).replace('.', ','),
          o.reference,
          o.note,
          effectiveStatus(o, reviews, reversals),
        ]),
      ]),
    );
  }
  return (
    <>
      {!compact && (
        <>
          <div className="form-grid">
            <Field label="De">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Até">
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Competência (21 a 20)">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Field label="Veículo">
              <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                <option value="">Todos</option>
                {data.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Comboísta (identificador)">
              <select value={author} onChange={(e) => setAuthor(e.target.value)}>
                <option value="">Todos</option>
                {[...new Set(data.history.map((o) => o.createdBy))].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos</option>
                {['registrado', 'validado', 'pendente', 'cancelado'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="actions">
            <button className="secondary" disabled={busy || more} onClick={exportHistory}>
              Exportar CSV para Excel
            </button>
            {more && (
              <>
                <button disabled={!online || busy} onClick={() => load()}>
                  Carregar mais 100
                </button>
                <button disabled={!online || busy} onClick={() => load(true)}>
                  Carregar histórico completo
                </button>
              </>
            )}
          </div>
          <p className="muted">
            {filtered.length} registro(s).{' '}
            {more
              ? 'Filtros cobrem apenas a seleção carregada. Carregue o histórico completo para exportar.'
              : ''}
          </p>
        </>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Movimento</th>
              <th>Ativo / tanque</th>
              <th>Litros</th>
              <th>Status</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td>{day(o).split('-').reverse().join('/')}</td>
                <td>
                  {names[o.kind]}
                  <small>{productName(o.product)}</small>
                </td>
                <td>
                  {o.assetId
                    ? data.assets.find((a) => a.id === o.assetId)?.code || o.assetId
                    : data.tanks.find((t) => t.id === o.tankId)?.name}
                </td>
                <td>{formatMilli(o.quantityMl)}</td>
                <td>{effectiveStatus(o, reviews, reversals)}</td>
                <td>
                  <button
                    className="secondary"
                    onClick={() => {
                      setDetail(o);
                      setPhoto('');
                    }}
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p>Nenhum registro neste filtro.</p>}
      </div>
      {detail && (
        <div className="detail">
          <h3>Registro {detail.id}</h3>
          <p>
            {detail.reference} · {detail.note}
          </p>
          <p>
            Usuário: {detail.createdBy} · Motorista:{' '}
            {data.drivers.find((d) => d.id === detail.driverId)?.name || 'Não informado'}
          </p>
          <p>
            Preço/L: {money((detail.unitPriceMicros || 0) / 10000)} · Total:{' '}
            {money(detail.totalCents || 0)} · Leitura: {formatMilli(detail.readingMilli)}{' '}
            {data.assets.find((a) => a.id === detail.assetId)?.meter === 'km' ? 'km' : 'h'}
          </p>
          <p>
            Capturado:{' '}
            {detail.capturedAtMs
              ? new Date(detail.capturedAtMs).toLocaleString('pt-BR')
              : 'Registro legado'}{' '}
            · Confirmado:{' '}
            {detail.createdAt?.milliseconds
              ? new Date(detail.createdAt.milliseconds).toLocaleString('pt-BR')
              : '—'}
          </p>
          <button
            className="secondary"
            disabled={!online}
            onClick={() =>
              action(
                async () => {
                  const s = await getDoc(
                    doc(await getDatabase(), 'sites', site, 'attachments', detail.id),
                  );
                  setPhoto(s.data()?.dataUrl || '');
                  if (!s.exists()) throw Error('Registro sem foto.');
                },
                'Comprovante carregado.',
                false,
              )
            }
          >
            Ver comprovante
          </button>
          {photo && <img className="proof" src={photo} alt="Comprovante do lançamento" />}
          {manager && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  s = String(f.get('status')),
                  reason = String(f.get('reason'));
                action(async () => {
                  if (s === 'cancelado') {
                    if (detail.schema !== 2)
                      throw Error(
                        'Registro legado: estorno automático indisponível. Preserve o histórico e solicite migração conferida.',
                      );
                    const c = normalizeCommand({
                      ...detail,
                      id: crypto.randomUUID(),
                      kind: 'reversal',
                      reverses: detail.id,
                      reference: reason,
                      capturedAtMs: Date.now(),
                    });
                    await enqueue(c);
                  } else await review(await getDatabase(), site, uid, detail.id, s, reason);
                }, 'Conferência registrada.');
              }}
            >
              <Field label="Conferência">
                <select name="status">
                  <option value="validado">Validado</option>
                  <option value="pendente">Pendência</option>
                  <option value="registrado">Registrado</option>
                  <option value="cancelado">Cancelar com estorno</option>
                </select>
              </Field>
              <Field label="Motivo (obrigatório)">
                <input name="reason" maxLength={120} required />
              </Field>
              <button
                disabled={!online || busy || !!reversals[detail.id] || detail.kind === 'reversal'}
              >
                Aplicar conferência
              </button>
            </form>
          )}
          <button className="secondary" onClick={() => setDetail(null)}>
            Fechar detalhes
          </button>
        </div>
      )}
    </>
  );
}
