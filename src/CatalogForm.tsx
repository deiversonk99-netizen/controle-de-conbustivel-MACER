import { useState, type FormEvent } from 'react';
import { Field, type Row } from './ui';
import { products } from './data/catalog';
import { toMilli } from './domain/quantity.mjs';
import { getDatabase } from './firebase';
import { saveCatalog } from './data/ledger.mjs';
export default function CatalogForm({
  group,
  rows,
  site,
  uid,
  disabled,
  action,
}: {
  group: string;
  rows: Row[];
  site: string;
  uid: string;
  disabled: boolean;
  action: (work: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [edit, setEdit] = useState<Row | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    await action(async () => {
      const values: Row = {
          name: String(f.get('name')).trim(),
          active: f.get('active') === 'true',
        },
        reason = String(f.get('reason'));
      let id = edit?.id || crypto.randomUUID();
      if (group === 'drivers') values.code = String(f.get('code') || '').trim();
      if (group === 'assets') {
        if (!edit) {
          id = String(f.get('code') || '')
            .trim()
            .toUpperCase();
          if (!/^[A-Z0-9-]{1,40}$/.test(id))
            throw Error('Código: letras, números e hífen, até 40 caracteres.');
          if (rows.some((a) => a.id === id)) throw Error('Código já cadastrado.');
        }
        Object.assign(values, {
          plate: String(f.get('plate') || '').toUpperCase(),
          type: String(f.get('type') || ''),
          model: String(f.get('model') || ''),
          owner: String(f.get('owner') || ''),
          ownership: String(f.get('ownership')),
          capacities: Object.fromEntries(
            Object.keys(products).map((p) => [p, toMilli(f.get('cap-' + p) || '0')]),
          ),
        });
        if (!edit)
          Object.assign(values, {
            code: id,
            product: String(f.get('product')),
            capacityMl: values.capacities[String(f.get('product'))],
            readingMilli: toMilli(f.get('reading')),
            meter: String(f.get('meter')),
          });
      }
      if (group === 'tanks') {
        values.minimumMl = toMilli(f.get('minimum'));
        if (!edit)
          Object.assign(values, {
            product: String(f.get('product')),
            capacityMl: toMilli(f.get('capacity')),
            balanceMl: 0,
          });
      }
      await saveCatalog(await getDatabase(), site, uid, group, id, values, reason, !edit);
      setEdit(null);
      form.reset();
    });
  }
  return (
    <section className="card">
      <h2>
        {edit ? 'Editar cadastro' : 'Novo cadastro'} ·{' '}
        {{ drivers: 'Motoristas', assets: 'Veículos', tanks: 'Tanques' }[group]}
      </h2>
      <p className="muted">
        Cadastre online e sincronize para usar offline. Motorista identifica quem conduz; comboísta
        é o usuário que registra.
      </p>
      <form key={edit?.id || 'new'} onSubmit={submit}>
        <fieldset disabled={disabled}>
          <div className="form-grid">
            {group !== 'tanks' && (
              <Field label="Código">
                <input
                  name="code"
                  maxLength={40}
                  defaultValue={edit?.code || ''}
                  required={group === 'assets'}
                  disabled={group === 'assets' && !!edit}
                />
              </Field>
            )}
            <Field label="Nome">
              <input name="name" maxLength={100} required defaultValue={edit?.name || ''} />
            </Field>
            <Field label="Situação">
              <select name="active" defaultValue={String(edit?.active ?? true)}>
                <option value="true">Ativo</option>
                <option value="false" disabled={!edit && group !== 'drivers'}>
                  Inativo
                </option>
              </select>
            </Field>
            {group === 'assets' && (
              <>
                <Field label="Placa">
                  <input name="plate" maxLength={20} defaultValue={edit?.plate || ''} />
                </Field>
                <Field label="Tipo">
                  <input name="type" maxLength={60} defaultValue={edit?.type || ''} />
                </Field>
                <Field label="Modelo">
                  <input name="model" maxLength={100} defaultValue={edit?.model || ''} />
                </Field>
                <Field label="Proprietário">
                  <input name="owner" maxLength={100} defaultValue={edit?.owner || ''} />
                </Field>
                <Field label="Locação">
                  <select name="ownership" defaultValue={edit?.ownership || 'own'}>
                    <option value="own">Próprio</option>
                    <option value="third">Terceiro</option>
                  </select>
                </Field>
                {Object.entries(products).map(([p, label]) => (
                  <Field key={p} label={`Capacidade ${label} (L; 0 = não utiliza)`}>
                    <input
                      name={'cap-' + p}
                      inputMode="decimal"
                      required
                      defaultValue={String(
                        ((edit?.capacities || {})[p] ??
                          (edit?.product === p ? edit?.capacityMl : 0)) / 1000,
                      )}
                    />
                  </Field>
                ))}
                {!edit && (
                  <>
                    <Field label="Medidor">
                      <select name="meter">
                        <option value="hours">Horímetro (h)</option>
                        <option value="km">Hodômetro (km)</option>
                      </select>
                    </Field>
                    <Field label="Leitura inicial">
                      <input name="reading" required inputMode="decimal" />
                    </Field>
                  </>
                )}
              </>
            )}
            {group !== 'drivers' && !edit && (
              <Field label="Produto principal">
                <select name="product">
                  {Object.entries(products).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {group === 'tanks' && (
              <>
                {!edit && (
                  <Field label="Capacidade (litros)">
                    <input name="capacity" defaultValue="5000" inputMode="decimal" required />
                  </Field>
                )}
                <Field label="Alerta abaixo de (litros)">
                  <input
                    name="minimum"
                    inputMode="decimal"
                    required
                    defaultValue={String((edit?.minimumMl || 0) / 1000)}
                  />
                </Field>
              </>
            )}
            <Field label="Motivo do cadastro / alteração">
              <input
                name="reason"
                required
                maxLength={500}
                defaultValue={edit ? '' : 'Cadastro inicial'}
              />
            </Field>
          </div>
          <button>{edit ? 'Salvar alteração com auditoria' : 'Cadastrar'}</button>
        </fieldset>
      </form>
      {edit && (
        <button className="secondary" onClick={() => setEdit(null)}>
          Novo cadastro
        </button>
      )}
      <h3>Cadastros da unidade</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code || r.id.slice(0, 8)}</td>
                <td>{r.name}</td>
                <td>{r.active ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <button className="secondary" onClick={() => setEdit(r)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
