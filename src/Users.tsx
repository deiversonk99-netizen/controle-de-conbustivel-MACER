import { useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { createAccount, getDatabase } from './firebase';
import { Field, type Row } from './ui';
export default function Users({
  site,
  uid,
  disabled,
  action,
}: {
  site: string;
  uid: string;
  disabled: boolean;
  action: (work: () => Promise<unknown>, message?: string, reload?: boolean) => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [edit, setEdit] = useState<Row | null>(null),
    [createdUid, setCreatedUid] = useState('');
  async function load() {
    const db = await getDatabase(),
      s = await getDocs(query(collection(db, 'users'), where('siteIds', '==', [site])));
    setRows(s.docs.map((d) => ({ ...d.data(), id: d.id })));
  }
  return (
    <section className="card">
      <h2>Usuários da unidade</h2>
      <p>
        Cadastre comboístas e responsáveis. Administradores de várias unidades e alterações da sua
        própria conta são gerenciados no console pelo proprietário.
      </p>
      <button disabled={disabled} onClick={() => action(load, 'Usuários carregados.', false)}>
        Carregar usuários
      </button>
      {createdUid && (
        <p className="warning">
          Conta criada no Authentication: {createdUid}. Se a liberação do perfil falhar, copie este
          identificador e use “UID existente” para concluir; não crie outra conta.
        </p>
      )}
      <form
        key={edit?.id || 'new'}
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          action(
            async () => {
              const db = await getDatabase();
              let target = edit?.id || String(f.get('uid') || '').trim() || createdUid;
              if (!target) {
                if (String(f.get('password') || '').length < 12)
                  throw Error('Use uma senha inicial com pelo menos 12 caracteres.');
                target = await createAccount(String(f.get('email')), String(f.get('password')));
                setCreatedUid(target);
              }
              if (target === uid) throw Error('Você não pode alterar o próprio perfil.');
              const auditId = crypto.randomUUID();
              await runTransaction(db, async (tx) => {
                const ref = doc(db, 'users', target),
                  s = await tx.get(ref),
                  before = s.data() || {};
                const after = {
                  name: String(f.get('name')),
                  email: String(f.get('email')),
                  role: String(f.get('role')),
                  active: f.get('active') === 'true',
                  siteIds: [site],
                  auditId,
                  updatedAt: serverTimestamp(),
                };
                tx.set(ref, after);
                tx.set(doc(db, 'sites', site, 'userAudits', auditId), {
                  subjectId: target,
                  before,
                  after,
                  reason: String(f.get('reason')),
                  createdBy: uid,
                  createdAt: serverTimestamp(),
                });
              });
              setEdit(null);
              setCreatedUid('');
              form.reset();
              await load();
            },
            'Usuário salvo.',
            false,
          );
        }}
      >
        <fieldset disabled={disabled}>
          <div className="form-grid">
            <Field label="Nome">
              <input name="name" required maxLength={100} defaultValue={edit?.name || ''} />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                name="email"
                required
                readOnly={Boolean(edit)}
                defaultValue={edit?.email || ''}
              />
            </Field>
            {!edit && (
              <>
                <Field label="Senha inicial (somente nova conta)">
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="UID existente (opcional)">
                  <input name="uid" defaultValue={createdUid} />
                </Field>
              </>
            )}
            <Field label="Perfil">
              <select name="role" defaultValue={edit?.role || 'operator'}>
                <option value="operator">Comboísta</option>
                <option value="manager">Responsável</option>
              </select>
            </Field>
            <Field label="Situação">
              <select name="active" defaultValue={String(edit?.active ?? true)}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </Field>
            <Field label="Motivo">
              <input name="reason" required maxLength={500} />
            </Field>
          </div>
          <button>{edit ? 'Atualizar perfil' : 'Criar / liberar usuário'}</button>
        </fieldset>
      </form>
      {edit && (
        <button className="secondary" onClick={() => setEdit(null)}>
          Novo usuário
        </button>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Perfil</th>
              <th>Situação</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  <small>{r.email}</small>
                </td>
                <td>{r.role}</td>
                <td>{r.active ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <button
                    className="secondary"
                    disabled={r.id === uid || r.role === 'admin'}
                    onClick={() => setEdit(r)}
                  >
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
