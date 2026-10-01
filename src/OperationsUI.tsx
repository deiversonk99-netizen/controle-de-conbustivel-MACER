import { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { auth, getDatabase } from './firebase';
import { productName, type Profile } from './data/catalog';
import { allDocs, execute, savePhoto, savePending, closeTank } from './data/ledger.mjs';
import {
  cacheGet,
  cachePut,
  queueList,
  queuePut,
  queueRemove,
  migrateLegacy,
  type Queued,
} from './data/offline';
import { submitOperation as executeLegacy } from './data/operations.mjs';
import { drain } from './data/sync.mjs';
import { civilDay } from './domain/business.mjs';
import { formatMilli, toMilli } from './domain/quantity.mjs';
import { Field, pack, day, names, money, errorMessage, download, type Row } from './ui';
import OperationForm from './OperationForm';
import CatalogForm from './CatalogForm';
import History from './History';
import Users from './Users';
import PendingPanel from './PendingPanel';

export default function OperationsUI({
  uid,
  site,
  profile,
  online,
}: {
  uid: string;
  site: string;
  profile: Profile;
  online: boolean;
}) {
  const [tab, setTab] = useState('home'),
    [data, setData] = useState<Record<string, Row[]>>({
      tanks: [],
      assets: [],
      drivers: [],
      history: [],
      reviews: [],
      reversals: [],
      closures: [],
      pending: [],
      audits: [],
    });
  const [items, setItems] = useState<Queued[]>([]),
    [busy, setBusy] = useState(false),
    [syncing, setSyncing] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [prepared, setPrepared] = useState(0),
    [cursor, setCursor] = useState<any>(null),
    [more, setMore] = useState(false);
  const syncingRef = useRef(false),
    mounted = useRef(true),
    submission = useRef(false);
  const manager = profile.role !== 'operator',
    admin = profile.role === 'admin',
    cacheKey = `catalog:${uid}:${site}`;
  const pending = items.filter((q) => !['synced', 'resolved'].includes(q.state)),
    reversals = Object.fromEntries(data.reversals.map((r) => [r.id, r]));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!online) return;
    let cancelled = false,
      stop: (() => void) | undefined;
    getDatabase()
      .then((db) => {
        if (cancelled) return;
        stop = onSnapshot(
          collection(db, 'sites', site, 'tanks'),
          (snapshot) => {
            if (snapshot.metadata.fromCache || cancelled) return;
            setData((d) => ({
              ...d,
              tanks: snapshot.docs.map((s) => pack({ ...s.data(), id: s.id })),
            }));
          },
          (e) => {
            if (!cancelled) setError(errorMessage(e));
          },
        );
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [online, site]);
  async function checkAccess() {
    const db = await getDatabase(),
      p = await getDocFromServer(doc(db, 'users', uid));
    if (!p.data()?.active || !p.data()?.siteIds?.includes(site))
      throw Error('Acesso revogado. Os registros locais foram preservados.');
    return db;
  }
  async function refresh() {
    if (!navigator.onLine) return;
    const db = await checkAccess();
    const groups = [
      'tanks',
      'assets',
      'drivers',
      'reviews',
      'reversals',
      'resolutions',
      ...(manager ? ['closures', 'pending'] : []),
    ];
    const results = await Promise.all(groups.map((g) => allDocs(db, site, g, uid, profile.role)));
    const h = await getDocs(
      query(
        collection(db, 'sites', site, 'operations'),
        ...(manager ? [] : [where('createdBy', '==', uid)]),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
    );
    const loaded = {
      ...Object.fromEntries(groups.map((g, i) => [g, results[i]])),
      history: h.docs.map((d) => ({ ...d.data(), id: d.id })),
    };
    const snapshot = pack(loaded),
      at = Date.now();
    await cachePut(cacheKey, { data: snapshot, at, more: h.size === 100 });
    if (!mounted.current) return;
    const resolved = new Map((snapshot.resolutions || []).map((r: Row) => [r.id, r]));
    for (const item of await queueList(uid, site)) {
      const r = resolved.get(item.id) as Row | undefined;
      if (r && item.state !== 'synced')
        await queuePut({
          ...item,
          state: 'resolved',
          error: `Tratado: ${r.reason}${r.operationId ? ' · Protocolo ' + r.operationId : ''}`,
        });
    }
    setItems(await queueList(uid, site));
    setData((d) => ({ ...d, ...snapshot }));
    setPrepared(at);
    setCursor(h.docs.at(-1));
    setMore(h.size === 100);
  }
  async function sync() {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing(true);
    setError('');
    try {
      await migrateLegacy(uid, site);
      const db = await checkAccess();
      await drain({
        uid,
        site,
        list: queueList,
        put: queuePut,
        execute: (c: any) =>
          c.schema === 2 ? execute(db, site, uid, c) : executeLegacy(db, site, uid, c),
        photo: (id: string, value: string) => savePhoto(db, site, uid, id, value),
        pending: (q: Queued) => savePending(db, site, uid, q),
        online: () => navigator.onLine,
        isCurrent: () => mounted.current && auth?.currentUser?.uid === uid,
      });
      if (mounted.current) {
        setItems(await queueList(uid, site));
        await refresh();
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      syncingRef.current = false;
      if (mounted.current) setSyncing(false);
    }
  }
  useEffect(() => {
    cacheGet(cacheKey)
      .then((c) => {
        if (c && mounted.current) {
          setData((d) => ({ ...d, ...c.data }));
          setPrepared(c.at);
          setMore(c.more);
        }
      })
      .catch((e) => setError(errorMessage(e)));
    migrateLegacy(uid, site)
      .then(() => queueList(uid, site))
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, [cacheKey]);
  useEffect(() => {
    if (online) sync();
    const timer = window.setInterval(() => {
      if (navigator.onLine)
        queueList(uid, site)
          .then((q) => {
            if (q.some((i) => i.state === 'queued' || (i.state === 'conflict' && !i.published)))
              sync();
          })
          .catch((e) => setError(errorMessage(e)));
    }, 15000);
    return () => clearInterval(timer);
  }, [online]);
  async function action(
    work: () => Promise<unknown>,
    success = 'Salvo com sucesso.',
    reload = true,
  ) {
    if (submission.current) return;
    submission.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      setMessage(success);
      if (reload) await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submission.current = false;
      setBusy(false);
    }
  }
  async function enqueue(c: any, image?: string) {
    await queuePut({
      id: c.id,
      uid,
      site,
      command: c,
      photo: image,
      state: 'queued',
      queuedAt: Date.now(),
    });
    setItems(await queueList(uid, site));
    navigator.storage?.persist?.().catch(() => {});
    setMessage('Salvo neste aparelho. Acompanhe o protocolo e a confirmação em Pendências.');
    void sync();
  }
  async function historyPage(full = false) {
    await action(
      async () => {
        const db = await getDatabase();
        if (full) {
          const rows = await allDocs(db, site, 'operations', uid, profile.role);
          setData((d) => ({ ...d, history: pack(rows) }));
          setMore(false);
          return;
        }
        const h = await getDocs(
          query(
            collection(db, 'sites', site, 'operations'),
            ...(manager ? [] : [where('createdBy', '==', uid)]),
            orderBy('createdAt', 'desc'),
            limit(100),
            ...(cursor ? [startAfter(cursor)] : []),
          ),
        );
        setData((d) => ({
          ...d,
          history: [
            ...new Map(
              [...d.history, ...h.docs.map((s) => pack({ ...s.data(), id: s.id }))].map((r) => [
                r.id,
                r,
              ]),
            ).values(),
          ],
        }));
        setCursor(h.docs.at(-1));
        setMore(h.size === 100);
      },
      'Histórico carregado.',
      false,
    );
  }
  const today = data.history.filter((o) => day(o) === civilDay()),
    fuelToday = today.filter((o) => o.kind === 'fuel' && !reversals[o.id]);
  const tabs = [
    ['home', 'Resumo'],
    ['fuel', 'Abastecer'],
    ...(manager
      ? [
          ['receipt', 'Receber'],
          ['transfer', 'Transferir'],
          ['closing', 'Fechamento'],
        ]
      : []),
    ...(admin ? [['opening', 'Saldo inicial']] : []),
    ['history', 'Histórico'],
    ['queue', `Pendências (${pending.length})`],
    ...(admin
      ? [
          ['drivers', 'Motoristas'],
          ['assets', 'Veículos'],
          ['tanks', 'Tanques'],
          ['users', 'Usuários'],
        ]
      : []),
    ...(manager ? [['audit', 'Auditoria']] : []),
  ];
  return (
    <>
      <nav className="tabs" aria-label="Módulos">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'selected' : ''}
            aria-pressed={tab === id}
            disabled={busy}
            onClick={() => {
              setTab(id);
              setError('');
              setMessage('');
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="sync-bar">
        <span>
          {prepared
            ? `Cadastros no aparelho: ${new Date(prepared).toLocaleString('pt-BR')}`
            : 'Cadastros ainda não preparados'}{' '}
          · {pending.length} pendente(s)
        </span>
        <button disabled={!online || syncing || busy} className="secondary" onClick={sync}>
          {syncing ? 'Sincronizando…' : 'Sincronizar / atualizar'}
        </button>
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tab === 'home' && (
        <>
          <div className="stats">
            <section className="card">
              <span>Abastecimentos hoje</span>
              <b>{fuelToday.length}</b>
            </section>
            <section className="card">
              <span>Litros abastecidos</span>
              <b>{formatMilli(fuelToday.reduce((s, o) => s + o.quantityMl, 0))}</b>
            </section>
            <section className="card">
              <span>Valor registrado hoje</span>
              <b>{money(fuelToday.reduce((s, o) => s + (o.totalCents || 0), 0))}</b>
            </section>
          </div>
          <section className="card">
            <h2>Abastecimentos do dia · {civilDay()}</h2>
            {more && (
              <p className="warning">
                Resumo parcial dos registros carregados. Carregue o histórico completo para conferir
                períodos maiores.
              </p>
            )}
            <History
              data={{ ...data, history: fuelToday }}
              site={site}
              uid={uid}
              manager={manager}
              online={online}
              busy={busy}
              more={more}
              load={historyPage}
              action={action}
              enqueue={enqueue}
              compact
            />
            <p className="muted">
              {manager ? 'Dados da unidade.' : 'Somente seus registros.'} Pendências locais não
              compõem o estoque confirmado.
            </p>
          </section>
        </>
      )}
      {['fuel', 'receipt', 'transfer', 'opening'].includes(tab) && (
        <OperationForm
          key={tab}
          kind={tab}
          data={data}
          online={online}
          prepared={prepared}
          save={enqueue}
        />
      )}
      {tab === 'history' && (
        <section className="card">
          <h2>Histórico e relatórios</h2>
          <History
            data={data}
            site={site}
            uid={uid}
            manager={manager}
            online={online}
            busy={busy}
            more={more}
            load={historyPage}
            action={action}
            enqueue={enqueue}
          />
        </section>
      )}
      {tab === 'queue' && (
        <section className="card">
          <h2>Pendências e sincronização</h2>
          <button
            className="secondary"
            disabled={syncing || busy}
            onClick={() =>
              action(
                async () => {
                  for (const q of await queueList(uid, site))
                    if (['synced', 'resolved'].includes(q.state)) await queueRemove(q.id);
                  setItems(await queueList(uid, site));
                },
                'Cópias locais confirmadas removidas. O histórico no banco foi preservado.',
                false,
              )
            }
          >
            Liberar espaço de registros confirmados
          </button>
          <p>
            Não limpe os dados do navegador antes de sincronizar. O primeiro acesso e a preparação
            dos cadastros precisam de internet.
          </p>
          <button
            className="secondary"
            onClick={() =>
              download(
                `MACER-fila-${site}.json`,
                JSON.stringify(items, null, 2),
                'application/json',
              )
            }
          >
            Baixar cópia da fila
          </button>
          {items.length === 0 && <p>Nenhum lançamento local.</p>}
          {[...items].reverse().map((q) => (
            <article className="queue-item" key={q.id}>
              <strong>
                {names[q.command.kind]} · {formatMilli(q.command.quantityMl)} L ·{' '}
                {q.state === 'synced'
                  ? 'Confirmado'
                  : q.state === 'resolved'
                    ? 'Tratado pelo responsável'
                    : q.state === 'conflict'
                      ? 'Conferência necessária'
                      : 'Aguardando envio'}
              </strong>
              <p>
                {q.command.assetId} · {new Date(q.queuedAt).toLocaleString('pt-BR')}
              </p>
              <small>Protocolo: {q.id}</small>
              {q.error && <p className="error">{q.error}</p>}
              {q.operationConfirmed && q.state !== 'synced' && (
                <p>Movimento confirmado; somente o comprovante está pendente.</p>
              )}
              {q.state === 'conflict' && (
                <button
                  className="secondary"
                  disabled={!online || syncing}
                  onClick={() =>
                    action(
                      async () => {
                        await queuePut({ ...q, state: 'queued', error: '' });
                        await sync();
                      },
                      'Reverificação solicitada.',
                      false,
                    )
                  }
                >
                  Reverificar após correção do cadastro/estoque
                </button>
              )}
            </article>
          ))}
          {manager && (
            <PendingPanel
              data={data}
              site={site}
              uid={uid}
              disabled={!online || busy}
              action={action}
            />
          )}
        </section>
      )}
      {['drivers', 'assets', 'tanks'].includes(tab) && admin && (
        <CatalogForm
          key={tab}
          group={tab}
          rows={data[tab]}
          site={site}
          uid={uid}
          disabled={!online || busy}
          action={action}
        />
      )}
      {tab === 'closing' && manager && (
        <section className="card">
          <h2>Fechamento diário · {civilDay()}</h2>
          <p>
            Conferir as filas de todos os aparelhos antes de fechar. Lançamentos de um dia já
            fechado ficam pendentes para análise; não alteram o estoque silenciosamente.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action(
                async () =>
                  closeTank(
                    await getDatabase(),
                    site,
                    uid,
                    String(f.get('tank')),
                    toMilli(f.get('physical')),
                    String(f.get('reason')),
                  ),
                'Fechamento registrado.',
              );
            }}
          >
            <fieldset disabled={!online || busy || pending.length > 0}>
              <Field label="Tanque">
                <select name="tank" required>
                  <option value="">Selecione</option>
                  {data.tanks
                    .filter((t) => t.active && t.closedThrough !== civilDay())
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · saldo {formatMilli(t.balanceMl)} L
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Saldo físico medido (litros)">
                <input name="physical" inputMode="decimal" required />
              </Field>
              <Field label="Observação / justificativa da divergência">
                <textarea name="reason" maxLength={500} />
              </Field>
              <button>Conferir e fechar hoje</button>
            </fieldset>
          </form>
          {pending.length > 0 && (
            <p className="warning">Resolva os registros locais pendentes antes de fechar.</p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data / tanque</th>
                  <th>Inicial</th>
                  <th>Entradas</th>
                  <th>Saídas</th>
                  <th>Calculado</th>
                  <th>Físico</th>
                  <th>Diferença</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.closures.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.day}
                      <small>{data.tanks.find((t) => t.id === c.tankId)?.name}</small>
                    </td>
                    {['openingMl', 'inMl', 'outMl', 'balanceMl', 'physicalMl', 'differenceMl'].map(
                      (k) => (
                        <td key={k}>{formatMilli(c[k])}</td>
                      ),
                    )}
                    <td>
                      {c.status}
                      <small>{c.reason}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === 'audit' && manager && (
        <section className="card">
          <h2>Auditoria de alterações</h2>
          <button
            disabled={!online || busy}
            onClick={() =>
              action(
                async () => {
                  const db = await getDatabase(),
                    a = await allDocs(db, site, 'audits', uid, profile.role),
                    u = admin ? await allDocs(db, site, 'userAudits', uid, profile.role) : [];
                  setData((d) => ({
                    ...d,
                    audits: pack([...a, ...u.map((r) => ({ ...r, group: 'users' }))]),
                  }));
                },
                'Auditoria carregada.',
                false,
              )
            }
          >
            Carregar auditoria
          </button>
          {data.audits.map((a) => (
            <details key={a.id}>
              <summary>
                {a.group} · {a.subjectId} · {a.reason}
              </summary>
              <p>
                Autor: {a.createdBy} ·{' '}
                {new Date(a.createdAt?.milliseconds || 0).toLocaleString('pt-BR')}
              </p>
              <pre>{JSON.stringify({ antes: a.before, depois: a.after }, null, 2)}</pre>
            </details>
          ))}
        </section>
      )}
      {tab === 'users' && admin && (
        <Users site={site} uid={uid} disabled={!online || busy} action={action} />
      )}
      <section className="card stock">
        <h2>Estoque confirmado por tanque</h2>
        <div className="stats">
          {data.tanks.map((t) => (
            <div className="tank-summary" key={t.id}>
              <strong>
                {t.name} {!t.active && '· Inativo'}
              </strong>
              <span>{productName(t.product)}</span>
              <b>
                {formatMilli(t.balanceMl)} <small>L</small>
              </b>
              <span>Capacidade: {formatMilli(t.capacityMl)} L</span>
              {t.balanceMl < (t.minimumMl || 0) && (
                <p className="warning">Abaixo do mínimo de {formatMilli(t.minimumMl)} L</p>
              )}
              {t.closedThrough && <span>Fechado até {t.closedThrough}</span>}
            </div>
          ))}
        </div>
        <p className="muted">
          Consulta de {prepared ? new Date(prepared).toLocaleString('pt-BR') : '—'}. Pendências não
          estão incluídas. Confira o saldo físico.
        </p>
      </section>
    </>
  );
}
