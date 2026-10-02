import { useRef, useState, type FormEvent } from 'react';
import { Field, names, errorMessage, type Row } from './ui';
import { productName } from './data/catalog';
import { formatMilli, toMilli } from './domain/quantity.mjs';
import { normalizeCommand, amountCents } from './domain/business.mjs';
import { compactPhoto } from './data/offline';
import { money } from './ui';
export default function OperationForm({
  kind,
  data,
  prepared,
  online,
  save,
  onDraft,
}: {
  kind: string;
  data: Record<string, Row[]>;
  prepared: number;
  online: boolean;
  save: (c: any, image?: string) => Promise<void>;
  onDraft: (value: boolean) => void;
}) {
  const [tankId, setTank] = useState(''),
    [assetId, setAsset] = useState(''),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [quantity, setQuantity] = useState(''),
    [price, setPrice] = useState('0');
  const inFlight = useRef(false),
    id = useRef(crypto.randomUUID()),
    formRef = useRef<HTMLFormElement>(null);
  const [review, setReview] = useState<{ command: any; image?: string } | null>(null);
  const tank = data.tanks.find((t) => t.id === tankId),
    asset = data.assets.find((a) => a.id === assetId);
  let total = '—';
  try {
    total = money(
      amountCents(toMilli(quantity), Math.round(Number(price.replace(',', '.')) * 1e6)),
    );
  } catch {}
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      if (!prepared)
        throw Error('Carregue os cadastros com internet antes do primeiro lançamento.');
      const p = price.replace(',', '.');
      if (!/^\d+(\.\d{1,6})?$/.test(p)) throw Error('Preço: use até seis casas decimais.');
      const c = normalizeCommand({
        id: id.current,
        kind,
        tankId,
        assetId: kind === 'fuel' ? assetId : '',
        driverId: kind === 'fuel' ? String(f.get('driver') || '') : '',
        destinationTankId: String(f.get('destination') || ''),
        quantityMl: toMilli(quantity),
        readingMilli: kind === 'fuel' ? toMilli(f.get('reading')) : 0,
        unitPriceMicros: Math.round(Number(p) * 1e6),
        reference: String(f.get('reference') || '').trim(),
        note: String(f.get('note') || '').trim(),
        capturedAtMs: Date.now(),
      });
      if (!tank?.active || (kind === 'fuel' && !asset?.active))
        throw Error('Selecione os cadastros ativos.');
      if (kind === 'fuel' && asset) {
        const capacity =
          asset.capacities?.[tank.product] ||
          (asset.product === tank.product ? asset.capacityMl : 0);
        if (!capacity)
          throw Error('Este veículo não está cadastrado para o combustível selecionado.');
        if (c.quantityMl > capacity)
          throw Error(
            `Confira os litros: a capacidade deste veículo é ${formatMilli(capacity)} L.`,
          );
        if (c.readingMilli < asset.readingMilli)
          throw Error(
            `Confira a leitura: ela não pode ser menor que ${formatMilli(asset.readingMilli)}. Se o medidor foi trocado, procure o responsável.`,
          );
      }
      const file = f.get('photo') as File | null,
        image = file?.size ? await compactPhoto(file) : undefined;
      setReview({ command: c, image });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await save(review.command, review.image);
      onDraft(false);
      id.current = crypto.randomUUID();
      formRef.current?.reset();
      setReview(null);
      setTank('');
      setAsset('');
      setSearch('');
      setQuantity('');
      setPrice('0');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>{names[kind]}</h2>
      <p>
        {review
          ? '2 de 2 · Confira antes de confirmar'
          : '1 de 2 · Preencha os dados do abastecimento ou movimento'}
      </p>
      {!prepared && (
        <p className="warning">
          Conecte à internet e toque em “Sincronizar / atualizar” para preparar este aparelho.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <section className="review-card" aria-label="Conferir lançamento">
          <h3>Está tudo certo?</h3>
          <dl>
            <dt>Tanque</dt>
            <dd>
              {tank?.name} · {productName(tank?.product)}
            </dd>
            {asset && (
              <>
                <dt>Veículo</dt>
                <dd>
                  {asset.code} · {asset.plate} · {asset.name}
                </dd>
                <dt>Leitura</dt>
                <dd>
                  {formatMilli(review.command.readingMilli)} {asset.meter === 'km' ? 'km' : 'h'}
                </dd>
              </>
            )}
            {review.command.destinationTankId && (
              <>
                <dt>Destino</dt>
                <dd>{data.tanks.find((t) => t.id === review.command.destinationTankId)?.name}</dd>
              </>
            )}
            <dt>Quantidade</dt>
            <dd>
              <strong>{formatMilli(review.command.quantityMl)} litros</strong>
            </dd>
            <dt>Total</dt>
            <dd>{money(review.command.totalCents)}</dd>
            {review.command.driverId && (
              <>
                <dt>Motorista</dt>
                <dd>{data.drivers.find((d) => d.id === review.command.driverId)?.name}</dd>
              </>
            )}
            {review.command.reference && (
              <>
                <dt>Documento</dt>
                <dd>{review.command.reference}</dd>
              </>
            )}
            {review.image && (
              <>
                <dt>Foto</dt>
                <dd>Comprovante anexado</dd>
              </>
            )}
          </dl>
          <p>
            {online
              ? 'Ao confirmar, o registro será salvo no aparelho e enviado.'
              : 'Sem internet: pode confirmar. O registro ficará salvo neste aparelho para envio quando a conexão voltar.'}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={confirm}>
              {busy ? 'Salvando…' : 'Confirmar e salvar'}
            </button>
            <button className="secondary" disabled={busy} onClick={() => setReview(null)}>
              Voltar e corrigir
            </button>
          </div>
        </section>
      )}
      <form ref={formRef} onSubmit={submit} onChangeCapture={() => onDraft(true)} hidden={!!review}>
        <fieldset disabled={busy || !prepared}>
          <div className="form-grid">
            <Field label="Tanque de estoque">
              <select
                required
                value={tankId}
                onChange={(e) => {
                  setTank(e.target.value);
                  setAsset('');
                }}
              >
                <option value="">Selecione</option>
                {data.tanks
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {productName(t.product)}
                    </option>
                  ))}
              </select>
            </Field>
            {kind === 'transfer' && (
              <Field label="Tanque de destino">
                <select name="destination" required>
                  <option value="">Selecione</option>
                  {data.tanks
                    .filter((t) => t.active && t.id !== tankId && t.product === tank?.product)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {kind === 'fuel' && (
              <>
                <Field label="Pesquisar código ou placa">
                  <input
                    placeholder="Ex.: CP-30 ou placa do veículo"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setAsset('');
                    }}
                  />
                </Field>
                <Field label="Veículo / equipamento">
                  <select required value={assetId} onChange={(e) => setAsset(e.target.value)}>
                    <option value="">Selecione</option>
                    {data.assets
                      .filter(
                        (a) =>
                          a.active &&
                          ((a.capacities || {})[tank?.product] ||
                            (a.product === tank?.product && a.capacityMl)) &&
                          `${a.code} ${a.plate} ${a.name}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.plate} · {a.name}
                        </option>
                      ))}
                  </select>
                  {!tankId && <small>Escolha primeiro o tanque de estoque.</small>}
                  {asset && (
                    <small>
                      Capacidade:{' '}
                      {formatMilli(asset.capacities?.[tank?.product] || asset.capacityMl || 0)} L ·{' '}
                      {asset.name}
                    </small>
                  )}
                </Field>
                <Field label="Motorista (opcional)">
                  <select name="driver">
                    <option value="">Não informado</option>
                    {data.drivers
                      .filter((d) => d.active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.code}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  label={`Leitura ${asset?.meter === 'km' ? 'hodômetro (km)' : 'horímetro (h)'}`}
                >
                  <input name="reading" inputMode="decimal" required />
                  <small>Última confirmada: {formatMilli(asset?.readingMilli || 0)}</small>
                </Field>
              </>
            )}
            <Field label="Quantidade (litros)">
              <input
                name="quantity"
                inputMode="decimal"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ex.: 25,6"
              />
            </Field>
            <Field label="Preço por litro (R$)">
              <input
                name="price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </Field>
            <Field
              label={
                kind === 'fuel' ? 'NF / referência (opcional)' : 'Documento / motivo obrigatório'
              }
            >
              <input name="reference" maxLength={120} required={kind !== 'fuel'} />
            </Field>
            <Field label="Observação">
              <textarea name="note" maxLength={500} />
            </Field>
            <Field label="Foto do medidor / comprovante (opcional)">
              <input type="file" name="photo" accept="image/*" capture="environment" />
            </Field>
          </div>
          <p>
            Total: <strong>{total}</strong>
          </p>
          <p className="muted">
            Data, hora e usuário automáticos. Saldo consultado: {formatMilli(tank?.balanceMl || 0)}{' '}
            L.{' '}
            {online
              ? 'O servidor revalida o lançamento.'
              : 'O lançamento ficará pendente até voltar a internet.'}
          </p>
          {kind === 'opening' && (
            <p className="warning">
              Somente para estoque físico inicial de tanque sem movimentos. Confira fisicamente
              antes de lançar.
            </p>
          )}
          <button type="submit">{busy ? 'Preparando…' : 'Conferir lançamento'}</button>
        </fieldset>
      </form>
    </section>
  );
}
