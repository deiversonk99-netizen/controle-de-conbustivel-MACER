import { useEffect, useState, type FormEvent } from 'react';
import { getDatabase } from './firebase';
import {
  loadSetup,
  saveUnit,
  saveChecks,
  saveMeasurement,
  openFromMeasurement,
} from './data/setup.mjs';
import { cacheGet, cachePut } from './data/offline';
import { formatMilli, toMilli } from './domain/quantity.mjs';
import { Field, errorMessage, pack, type Row } from './ui';
import CatalogForm from './CatalogForm';
import type { Profile } from './data/catalog';

export default function UnitSetup({
  site,
  uid,
  profile,
  online,
  data,
  action,
  navigate,
  onDraft,
}: {
  site: string;
  uid: string;
  profile: Profile;
  online: boolean;
  data: Record<string, Row[]>;
  action: (work: () => Promise<unknown>, message?: string) => Promise<void>;
  navigate: (tab: string) => void;
  onDraft: (value: boolean) => void;
}) {
  const [unit, setUnit] = useState<Row | null>(null),
    [measurements, setMeasurements] = useState<Row[]>([]),
    [openings, setOpenings] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [creating, setCreating] = useState(false),
    [tankId, setTankId] = useState(''),
    [checks, setChecks] = useState({ assets: false, drivers: false, users: false });
  const key = `setup:${uid}:${site}`;
  function apply(value: Row) {
    setUnit(value.unit);
    setMeasurements(value.measurements);
    setOpenings(value.openings);
    setChecks(value.unit?.checks || { assets: false, drivers: false, users: false });
  }
  async function refresh() {
    const result = pack(await loadSetup(await getDatabase(), site));
    await cachePut(key, result);
    apply(result);
  }
  useEffect(() => {
    let current = true;
    cacheGet(key)
      .then((v) => {
        if (v && current) apply(v);
      })
      .catch((e) => setError(errorMessage(e)));
    if (online)
      getDatabase()
        .then((db) => loadSetup(db, site))
        .then(async (v) => {
          if (current) {
            const p = pack(v);
            apply(p);
            await cachePut(key, p);
          }
        })
        .catch((e) => {
          if (current) setError(errorMessage(e));
        });
    return () => {
      current = false;
    };
  }, [key, online]);
  async function work(job: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await job();
      await refresh();
      setMessage(success);
      form?.reset();
      onDraft(false);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function unitSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      raw = Object.fromEntries(f);
    const target = creating
      ? String(raw.crs)
          .split(/[,;\n]/)[0]
          .trim()
          .toLowerCase()
      : site;
    const saved = await work(
      async () => saveUnit(await getDatabase(), target, uid, raw, creating),
      creating
        ? 'Unidade cadastrada. Selecione a nova unidade no topo para continuar sua preparação.'
        : 'Unidade e responsável salvos com auditoria.',
    );
    if (creating && saved) setCreating(false);
  }
  async function measured(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    const time = String(f.get('measuredAt'));
    // The company operates in São Paulo time; do not interpret this field in the device's timezone.
    const measuredAtMs = new Date(time + ':00-03:00').getTime();
    await work(
      async () => {
        const raw = {
          id: crypto.randomUUID(),
          tankId,
          physicalMl: toMilli(f.get('physical')),
          measuredAtMs,
          measuredByName: f.get('measuredBy'),
          reference: f.get('reference'),
          noMovementsSince: f.get('noMovements') === 'on',
        };
        return saveMeasurement(await getDatabase(), site, uid, raw);
      },
      'Medição registrada. Confira abaixo antes de definir o saldo inicial.',
      form,
    );
  }
  const tanks = data.tanks.filter((t) => t.active),
    activeAssets = data.assets.filter((a) => a.active),
    activeDrivers = data.drivers.filter((d) => d.active);
  const tank = data.tanks.find((t) => t.id === tankId);
  const initialTanks = tanks.filter((t) => t.version === 0);
  const missing = tanks.filter(
    (t) =>
      t.version === 0 &&
      !measurements.some((m) => m.tankId === t.id && openings.some((o) => o.id === m.id)),
  );
  const prepared =
    !!unit &&
    unit.checks?.assets &&
    unit.checks?.drivers &&
    unit.checks?.users &&
    tanks.length > 0 &&
    missing.length === 0;
  return (
    <>
      <section className="card">
        <h2>Preparar unidade para operação</h2>
        <p>
          Preencha e confira estas etapas aqui no aplicativo. Os dados são salvos com identificação
          do administrador. Cadastros e preparação inicial precisam de internet.
        </p>
        {site === 'homologacao' && (
          <p className="warning">
            Esta é a unidade de teste. Use dados fictícios aqui. O administrador principal pode
            cadastrar uma unidade real pelo botão abaixo.
          </p>
        )}
        {!online && (
          <p className="warning">
            Você está vendo a última preparação salva neste aparelho. Conecte-se para cadastrar ou
            atualizar.
          </p>
        )}
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
        <p className={prepared ? 'success' : 'warning'}>
          {prepared
            ? 'Preparação inicial conferida. Antes de operar, sincronize os aparelhos e faça um lançamento controlado.'
            : 'Preparação em andamento. Complete os dados, confira os cadastros e defina os saldos iniciais dos tanques novos.'}
        </p>
        <h3>1. Unidade / CR e responsável</h3>
        <div className="actions">
          <button
            className="secondary"
            disabled={busy || !online || !profile.canCreateSites}
            onClick={() => {
              if (
                window.confirm(
                  'Abrir o cadastro de uma nova unidade? O preenchimento atual ainda não salvo será descartado.',
                )
              ) {
                setCreating(true);
                onDraft(false);
              }
            }}
          >
            Cadastrar nova unidade
          </button>
          {creating && (
            <button
              className="secondary"
              onClick={() => {
                if (!window.confirm('Voltar e descartar o cadastro ainda não salvo?')) return;
                setCreating(false);
                onDraft(false);
              }}
            >
              Voltar à unidade atual
            </button>
          )}
        </div>
        {!profile.canCreateSites && (
          <p className="muted">
            O cadastro de novas unidades é reservado ao administrador principal. Seu acesso às
            unidades atuais continua disponível; a conta de teste não recebe acesso a unidades
            reais.
          </p>
        )}
        <form
          key={creating ? 'new' : `${site}:${unit?.updatedAt?.milliseconds || 0}`}
          onSubmit={(e) => void unitSubmit(e)}
          onChange={() => onDraft(true)}
        >
          <fieldset disabled={!online || busy}>
            <div className="form-grid">
              <Field label="Nome da unidade / obra">
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={creating ? '' : unit?.name || ''}
                />
              </Field>
              <Field label="CRs da unidade (separados por vírgula)">
                <input
                  name="crs"
                  required
                  maxLength={820}
                  defaultValue={creating ? '' : unit?.crs?.join(', ') || ''}
                />
              </Field>
              <Field label="Nome do responsável">
                <input
                  name="responsibleName"
                  required
                  maxLength={100}
                  defaultValue={creating ? '' : unit?.responsibleName || ''}
                />
              </Field>
              <Field label="E-mail do responsável">
                <input
                  name="responsibleEmail"
                  type="email"
                  required
                  maxLength={254}
                  defaultValue={creating ? '' : unit?.responsibleEmail || ''}
                />
              </Field>
            </div>
            <p className="muted">
              Este cadastro identifica o responsável. O acesso dele ao sistema é liberado em
              Usuários.
            </p>
            <button>{creating ? 'Criar unidade' : 'Salvar unidade e responsável'}</button>
          </fieldset>
        </form>
      </section>
      <section className="card">
        <h3>2. Conferir cadastros da unidade</h3>
        <p>
          {activeAssets.length} veículos/equipamentos ativos · {activeDrivers.length} motoristas
          ativos · {tanks.length} tanques ativos.
        </p>
        <div className="actions">
          <button className="secondary" onClick={() => navigate('assets')}>
            Cadastrar / conferir veículos
          </button>
          <button className="secondary" onClick={() => navigate('drivers')}>
            Cadastrar / conferir motoristas
          </button>
          <button className="secondary" onClick={() => navigate('users')}>
            Liberar responsável e operadores
          </button>
        </div>
        <p>
          Confira capacidade por combustível e leitura atual de cada veículo. Motorista é quem
          conduz; operador/comboísta é quem registra.
        </p>
        <fieldset disabled={!online || busy || !unit}>
          {(['assets', 'drivers', 'users'] as const).map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={checks[k]}
                onChange={(e) => {
                  setChecks({ ...checks, [k]: e.target.checked });
                  onDraft(true);
                }}
              />{' '}
              {
                {
                  assets: 'Conferi veículos, capacidades e leituras iniciais',
                  drivers: 'Conferi os motoristas desta unidade',
                  users: 'Liberei o responsável e os operadores autorizados',
                }[k]
              }
            </label>
          ))}
          <button
            onClick={() =>
              void work(
                async () => saveChecks(await getDatabase(), site, uid, checks),
                'Conferência dos cadastros registrada.',
              )
            }
          >
            Salvar conferência dos cadastros
          </button>
        </fieldset>
      </section>
      <CatalogForm
        group="tanks"
        rows={data.tanks}
        site={site}
        uid={uid}
        disabled={!online || busy}
        action={action}
      />
      <section className="card">
        <h3>3. Registrar medição física do tanque</h3>
        <p>
          Informe a medição feita na empresa, incluindo saldo zero se o tanque estiver vazio. A
          capacidade e o produto vêm do cadastro do tanque. Registrar uma medição não altera o
          estoque.
        </p>
        <form
          onSubmit={(e) => {
            void measured(e).catch((err) => setError(errorMessage(err)));
          }}
          onChange={() => onDraft(true)}
        >
          <fieldset disabled={!online || busy}>
            <div className="form-grid">
              <Field label="Tanque medido">
                <select required value={tankId} onChange={(e) => setTankId(e.target.value)}>
                  <option value="">Selecione o tanque</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Saldo físico medido (litros)">
                <input name="physical" inputMode="decimal" required />
              </Field>
              <Field label="Data e hora da medição (Brasília)">
                <input name="measuredAt" type="datetime-local" required />
              </Field>
              <Field label="Quem realizou a medição">
                <input name="measuredBy" maxLength={100} required />
              </Field>
              <Field label="Referência / método da medição">
                <input
                  name="reference"
                  maxLength={120}
                  required
                  placeholder="Ex.: régua do tanque, conferência de abertura"
                />
              </Field>
            </div>
            {tank && (
              <p>
                Capacidade cadastrada: {formatMilli(tank.capacityMl)} L. Saldo atual:{' '}
                {formatMilli(tank.balanceMl)} L.{' '}
                {tank.version > 0
                  ? 'O tanque já possui movimentos. Use Fechamento para conferir diferenças; não é possível definir outro saldo inicial.'
                  : 'Tanque novo, sem movimentos.'}
              </p>
            )}
            <label>
              <input name="noMovements" type="checkbox" /> Confirmei que não houve entradas ou
              saídas desde esta medição até a abertura do tanque novo.
            </label>
            <button>Salvar medição física</button>
          </fieldset>
        </form>
        <h3>4. Conferir e definir o saldo inicial</h3>
        <p>
          Depois de conferir a medição de um tanque novo, toque em Definir saldo inicial. O sistema
          cria o movimento de abertura e impede reaproveitar a medição ou abrir o tanque novamente.
          Tanques que já operam devem ser conferidos em Fechamento.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tanque</th>
                <th>Medição</th>
                <th>Data/hora</th>
                <th>Quem mediu / referência</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {[...measurements]
                .sort((a, b) => b.measuredAtMs - a.measuredAtMs)
                .map((m) => {
                  const t = tanks.find((v) => v.id === m.tankId),
                    done = openings.some((o) => o.id === m.id);
                  return (
                    <tr key={m.id}>
                      <td>{t?.name || m.tankId}</td>
                      <td>{formatMilli(m.physicalMl)} L</td>
                      <td>
                        {new Date(m.measuredAtMs).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </td>
                      <td>
                        {m.measuredByName} · {m.reference}
                      </td>
                      <td>
                        {done ? (
                          'Saldo inicial conferido'
                        ) : t?.version !== 0 ? (
                          'Tanque já movimentado'
                        ) : !m.noMovementsSince ? (
                          'Confirmar uma nova medição sem movimentos posteriores'
                        ) : (
                          <button
                            disabled={!online || busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Confirmar ${formatMilli(m.physicalMl)} L como saldo inicial de ${t.name}? A medição ficará vinculada à abertura.`,
                                )
                              )
                                void work(async () => {
                                  await openFromMeasurement(await getDatabase(), site, uid, m);
                                  await action(async () => {}, 'Saldo inicial confirmado.');
                                }, 'Saldo inicial definido a partir da medição conferida.');
                            }}
                          >
                            Definir saldo inicial
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!measurements.length && <p>Nenhuma medição registrada nesta unidade.</p>}
        {!!initialTanks.length && (
          <p>{missing.length} tanque(s) novo(s) ainda sem saldo inicial conferido.</p>
        )}
      </section>
    </>
  );
}
