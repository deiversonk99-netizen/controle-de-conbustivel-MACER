import { useState } from 'react';
import { Field, type Row, names } from './ui';
import { getDatabase } from './firebase';
import { execute, dismissPending } from './data/ledger.mjs';
import { normalizeCommand } from './domain/business.mjs';
import { toMilli, formatMilli } from './domain/quantity.mjs';
export default function PendingPanel({
  data,
  site,
  uid,
  disabled,
  action,
}: {
  data: Record<string, Row[]>;
  site: string;
  uid: string;
  disabled: boolean;
  action: (work: () => Promise<unknown>, message?: string, reload?: boolean) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Row | null>(null),
    [correctionId, setCorrectionId] = useState(crypto.randomUUID());
  const resolutions = Object.fromEntries((data.resolutions || []).map((r) => [r.id, r]));
  return (
    <>
      <h3>Pendências recebidas pela unidade</h3>
      {data.pending.map((p) => (
        <article key={p.id} className="queue-item">
          <strong>
            {names[p.payload?.kind]} · {p.payload?.assetId} ·{' '}
            {formatMilli(p.payload?.quantityMl || 0)} L
          </strong>
          <p>{p.error}</p>
          <small>
            Autor: {p.createdBy} · Protocolo: {p.id}
          </small>
          {resolutions[p.id] ? (
            <p>
              Tratada por {resolutions[p.id].createdBy}: {resolutions[p.id].reason}
              {resolutions[p.id].operationId &&
                ` · Novo protocolo ${resolutions[p.id].operationId}`}
            </p>
          ) : (
            <button
              className="secondary"
              disabled={disabled}
              onClick={() => {
                setSelected(p);
                setCorrectionId(crypto.randomUUID());
              }}
            >
              Tratar pendência
            </button>
          )}
        </article>
      ))}
      {selected && !resolutions[selected.id] && (
        <form
          key={selected.id}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action(async () => {
              const db = await getDatabase(),
                reason = String(f.get('reason'));
              if (f.get('outcome') === 'dismissed')
                await dismissPending(db, site, uid, selected.id, reason);
              else {
                const c = normalizeCommand({
                  ...selected.payload,
                  id: correctionId,
                  corrects: selected.id,
                  reference: reason,
                  quantityMl: toMilli(f.get('quantity')),
                  readingMilli: selected.payload.kind === 'fuel' ? toMilli(f.get('reading')) : 0,
                  assetId: String(f.get('asset') || selected.payload.assetId || ''),
                  tankId: String(f.get('tank')),
                  capturedAtMs:
                    f.get('today') === 'true' ? Date.now() : selected.payload.capturedAtMs,
                });
                await execute(db, site, uid, c);
              }
              setSelected(null);
            }, 'Pendência tratada com rastreabilidade.');
          }}
        >
          <h3>Tratamento · {selected.id}</h3>
          <p>
            O original ficará preservado. A correção gera outro protocolo, atribuído ao responsável
            que a confirmou.
          </p>
          <fieldset disabled={disabled}>
            <div className="form-grid">
              <Field label="Decisão">
                <select name="outcome">
                  <option value="corrected">Corrigir e lançar</option>
                  <option value="dismissed">Rejeitar sem movimentar estoque</option>
                </select>
              </Field>
              <Field label="Tanque">
                <select name="tank" defaultValue={selected.payload.tankId}>
                  {data.tanks
                    .filter((t) => t.active)
                    .map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </Field>
              {selected.payload.kind === 'fuel' && (
                <>
                  <Field label="Ativo">
                    <select name="asset" defaultValue={selected.payload.assetId}>
                      {data.assets
                        .filter((a) => a.active)
                        .map((a) => (
                          <option value={a.id} key={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Leitura corrigida">
                    <input
                      name="reading"
                      defaultValue={String(selected.payload.readingMilli / 1000)}
                      inputMode="decimal"
                    />
                  </Field>
                </>
              )}
              <Field label="Litros corrigidos">
                <input
                  name="quantity"
                  defaultValue={String(selected.payload.quantityMl / 1000)}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Data operacional da correção">
                <select name="today">
                  <option value="false">Preservar data original</option>
                  <option value="true">Lançar hoje (original permanece na pendência)</option>
                </select>
              </Field>
              <Field label="Justificativa obrigatória">
                <input name="reason" required maxLength={120} />
              </Field>
            </div>
            <button>Confirmar tratamento</button>
          </fieldset>
        </form>
      )}
    </>
  );
}
