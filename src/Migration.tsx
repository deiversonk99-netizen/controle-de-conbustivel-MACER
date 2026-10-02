import { useEffect, useRef, useState } from 'react';
import { getDatabase } from './firebase';
import { normalizePackage } from './domain/archive.mjs';
import { importArchive } from './data/archive.mjs';
import { allDocs } from './data/ledger.mjs';
import { cacheGet, cachePut } from './data/offline';
import { csv } from './domain/business.mjs';
import { formatMilli } from './domain/quantity.mjs';
import { download, errorMessage, Field, pack, type Row } from './ui';
import CatalogForm from './CatalogForm';

export default function Migration({
  site,
  uid,
  admin,
  online,
  assets,
  action,
}: {
  site: string;
  uid: string;
  admin: boolean;
  online: boolean;
  assets: Row[];
  action: (work: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const [pkg, setPkg] = useState<Row | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [selectedUnits, setSelectedUnits] = useState<string[]>([]),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [preset, setPreset] = useState<Row | undefined>(),
    [search, setSearch] = useState(''),
    [history, setHistory] = useState<Row[]>([]),
    [loaded, setLoaded] = useState(false),
    [source, setSource] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const stop = useRef(false),
    mounted = useRef(true);
  const cacheKey = `legacy:${uid}:${site}`;
  useEffect(() => {
    mounted.current = true;
    cacheGet(cacheKey)
      .then((c) => {
        if (c && mounted.current) {
          setHistory(c.rows);
          setLoaded(true);
        }
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, [cacheKey]);
  const filtered = history.filter(
    (r) =>
      (!source || r.sourceSheet === source) &&
      (!from || r.businessDate >= from) &&
      (!to || r.businessDate <= to) &&
      `${r.assetId} ${r.personName} ${r.reference}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
  );
  const proposals = (pkg?.catalogs || []).filter((p: Row) =>
    `${p.code} ${p.unit} ${p.plate} ${p.model}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );
  const originalUnits = [
    ...new Set<string>(
      (pkg?.records || [])
        .filter((r: Row) => selected.includes(r.sourceSheet))
        .map((r: Row) => r.sourceUnit),
    ),
  ];
  const chosenRows = (pkg?.records || []).filter(
    (r: Row) => selected.includes(r.sourceSheet) && selectedUnits.includes(r.sourceUnit),
  );
  async function loadFile(file?: File) {
    setSelectedUnits([]);
    setPkg(null);
    setPreset(undefined);
    setApproved(false);
    setError('');
    setMessage('');
    if (!file) return;
    try {
      if (file.size > 30000000)
        throw Error('O pacote excede 30 MB. Divida a origem antes de importar.');
      const p = normalizePackage(JSON.parse(await file.text()));
      setPkg(p);
      setSelected([]); // No default assignment of workbook tabs to a real unit.
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function importRows() {
    if (!pkg || !approved || !online || busy || site === 'homologacao') return;
    setBusy(true);
    setError('');
    stop.current = false;
    try {
      const result = await importArchive(
        await getDatabase(),
        site,
        uid,
        { ...pkg, records: chosenRows },
        selected,
        (p: Row) => {
          if (mounted.current)
            setMessage(
              `${p.processed} de ${p.total} conferidos · ${p.inserted} importados · ${p.skipped} já existentes.`,
            );
        },
        () => stop.current || !navigator.onLine,
      );
      if (mounted.current)
        setMessage(
          `${result.inserted} importados; ${result.skipped} já existentes. ${result.stopped ? 'Importação interrompida. Selecione as mesmas abas para retomar sem duplicar.' : 'Importação concluída. Use Carregar histórico para consultar.'}`,
        );
    } catch (e) {
      if (mounted.current)
        setError(errorMessage(e) + ' Os lotes confirmados foram preservados; é possível retomar.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function loadHistory() {
    setBusy(true);
    setError('');
    try {
      const rows = pack(await allDocs(await getDatabase(), site, 'legacyHistory', uid, 'manager'));
      await cachePut(cacheKey, { rows });
      if (mounted.current) {
        setHistory(rows);
        setLoaded(true);
        setMessage(`${rows.length} registros históricos carregados e disponíveis neste aparelho.`);
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Implantação e histórico da planilha</h2>
      <p>
        Unidade selecionada: <strong>{site}</strong>. O histórico preserva os valores da planilha e
        não movimenta o estoque atual. Entradas e saídas antigas podem incluir transferências; não
        representam automaticamente consumo de veículos.
      </p>
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
      {admin && (
        <>
          <h3>1. Conferir o arquivo</h3>
          <p>
            Abra o pacote JSON de conferência preparado a partir da planilha. A prévia é local.
            Cadastros só serão ativados após confirmar unidade, capacidade, combustível e leitura
            inicial.
          </p>
          <Field label="Pacote de conferência (.json)">
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => void loadFile(e.target.files?.[0])}
            />
          </Field>
          {pkg && (
            <>
              <p>
                {pkg.sourceName} · {pkg.records.length} movimentos · {pkg.catalogs.length} propostas
                de cadastro · {pkg.rejected.length} linhas rejeitadas.
              </p>
              <details>
                <summary>Identificação e problemas da origem</summary>
                <p className="muted">SHA-256: {pkg.sourceHash}</p>
                {pkg.rejected.map((r: Row, i: number) => (
                  <p key={i}>
                    {r.sourceSheet}, linha {r.sourceRow}, coluna {r.sourceColumn}: {r.reason}
                  </p>
                ))}
              </details>
              <h3>2. Selecionar somente as abas desta unidade</h3>
              <p>
                Não selecione outras obras ou reservatórios. As abas ocultas também precisam de
                conferência. A importação é permanente e mantém quem a realizou e a origem de cada
                linha.
              </p>
              <fieldset disabled={busy}>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Importar</th>
                        <th>Aba</th>
                        <th>Situação</th>
                        <th>Registros</th>
                        <th>Entradas (L)</th>
                        <th>Saídas (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pkg.summary.map((s: Row) => (
                        <tr key={s.sheet}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Importar aba ${s.sheet}`}
                              checked={selected.includes(s.sheet)}
                              onChange={(e) => {
                                setApproved(false);
                                setSelected(
                                  e.target.checked
                                    ? [...selected, s.sheet]
                                    : selected.filter((v) => v !== s.sheet),
                                );
                              }}
                            />
                          </td>
                          <td>{s.sheet}</td>
                          <td>{s.state === 'visible' ? 'Visível' : 'Oculta na origem'}</td>
                          <td>{s.records}</td>
                          <td>{formatMilli(s.inMl)}</td>
                          <td>{formatMilli(s.outMl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h4>CR original dos registros selecionados</h4>
                <p>
                  Selecione somente os CRs que pertencem à unidade atual. CR vazio ou com erro exige
                  conferir as linhas na planilha antes de incluí-las.
                </p>
                {originalUnits.map((cr) => (
                  <label key={cr}>
                    <input
                      type="checkbox"
                      aria-label={`Incluir CR ${cr || 'não informado'}`}
                      checked={selectedUnits.includes(cr)}
                      onChange={(e) => {
                        setApproved(false);
                        setSelectedUnits(
                          e.target.checked
                            ? [...selectedUnits, cr]
                            : selectedUnits.filter((v) => v !== cr),
                        );
                      }}
                    />{' '}
                    {cr || 'Não informado na origem'} ·{' '}
                    {
                      pkg.records.filter(
                        (r: Row) => selected.includes(r.sourceSheet) && r.sourceUnit === cr,
                      ).length
                    }{' '}
                    registros
                  </label>
                ))}
                <details>
                  <summary>Ver amostra dos movimentos selecionados ({chosenRows.length})</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Origem</th>
                          <th>CR</th>
                          <th>Data</th>
                          <th>Código</th>
                          <th>Litros</th>
                          <th>Avisos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chosenRows.slice(0, 100).map((r: Row) => (
                          <tr key={r.id}>
                            <td>
                              {r.sourceSheet}:{r.sourceRow}:{r.sourceColumn}
                            </td>
                            <td>{r.sourceUnit}</td>
                            <td>{r.businessDate}</td>
                            <td>{r.assetId}</td>
                            <td>{formatMilli(r.quantityMl)}</td>
                            <td>{r.issues.join(' ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    A amostra mostra as primeiras 100 linhas. Confira a planilha original antes de
                    importar registros com CR ausente ou divergente.
                  </p>
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />{' '}
                  Confirmei que todos os registros selecionados pelas abas e CRs pertencem à unidade{' '}
                  {site}. Entendo que esta importação não define saldos físicos nem ativa cadastros.
                </label>
              </fieldset>
              {site === 'homologacao' && (
                <p className="warning">
                  Dados da empresa não devem ser importados na unidade fictícia. A prévia continua
                  disponível; a importação será habilitada na unidade real.
                </p>
              )}
              <button
                disabled={
                  busy || !online || !approved || !chosenRows.length || site === 'homologacao'
                }
                onClick={() => void importRows()}
              >
                Importar histórico conferido ({chosenRows.length})
              </button>
              {busy && (
                <button
                  className="secondary"
                  onClick={() => {
                    stop.current = true;
                  }}
                >
                  Parar após o lote atual
                </button>
              )}
              <h3>3. Conferir propostas de veículos</h3>
              <Field label="Buscar código, placa ou unidade">
                <input value={search} onChange={(e) => setSearch(e.target.value)} />
              </Field>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Origem</th>
                      <th>Código / placa</th>
                      <th>Unidade / modelo</th>
                      <th>Conferência</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p: Row) => (
                      <tr key={`${p.sourceSheet}:${p.sourceRow}`}>
                        <td>
                          {p.sourceSheet}:{p.sourceRow}
                        </td>
                        <td>
                          {p.code} / {p.plate || 'Sem placa'}
                        </td>
                        <td>
                          {p.unit} / {p.model}
                        </td>
                        <td>{p.issues.join(' ')}</td>
                        <td>
                          <button
                            className="secondary"
                            disabled={busy || site === 'homologacao'}
                            onClick={() =>
                              setPreset({
                                code: p.code,
                                name: p.model || p.code,
                                plate: p.plate,
                                type: p.type,
                                model: p.model,
                                owner: p.owner,
                                reason: `Conferido na origem ${p.sourceSheet}, linha ${p.sourceRow}; unidade ${p.unit}`,
                              })
                            }
                          >
                            Preparar cadastro
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preset && (
                <CatalogForm
                  key={`${preset.reason}`}
                  group="assets"
                  rows={assets}
                  site={site}
                  uid={uid}
                  disabled={!online || busy}
                  action={action}
                  preset={preset}
                />
              )}
            </>
          )}
        </>
      )}
      <h3>Consultar histórico importado</h3>
      <p>
        A consulta carrega o arquivo histórico completo desta unidade. Atualize com internet e
        consulte a cópia neste aparelho quando estiver offline.
      </p>
      <button className="secondary" disabled={!online || busy} onClick={() => void loadHistory()}>
        Carregar / atualizar histórico da planilha
      </button>
      {loaded && (
        <>
          <div className="form-grid">
            <Field label="Código, pessoa na origem ou documento">
              <input value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <Field label="Aba de origem">
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Todas</option>
                {[...new Set(history.map((r) => r.sourceSheet))].sort().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="De">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Até">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <p>
            {filtered.length} registros encontrados. Os primeiros 100 são exibidos; o CSV contém
            todos os resultados filtrados.
          </p>
          <button
            className="secondary"
            disabled={!filtered.length}
            onClick={() =>
              download(
                `historico-planilha-${site}.csv`,
                csv([
                  [
                    'Data',
                    'Movimento original',
                    'Litros',
                    'Código / destino',
                    'Pessoa na origem',
                    'Cabeçalho da pessoa na origem',
                    'CR original',
                    'Leitura original',
                    'Documento',
                    'Preço original',
                    'Total original',
                    'Produto',
                    'Aba',
                    'Linha',
                    'Coluna',
                    'Avisos',
                    'Hash do arquivo',
                  ],
                  ...filtered.map((r) => [
                    r.businessDate,
                    r.kind === 'legacy-in' ? 'Entrada' : 'Saída',
                    formatMilli(r.quantityMl),
                    r.assetId,
                    r.personName,
                    r.sourcePersonLabel,
                    r.sourceUnit,
                    r.legacyReading,
                    r.reference,
                    r.unitPriceText,
                    r.totalText,
                    r.product,
                    r.sourceSheet,
                    r.sourceRow,
                    r.sourceColumn,
                    r.issues.join(' | '),
                    r.sourceHash,
                  ]),
                ]),
              )
            }
          >
            Exportar resultados CSV
          </button>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Movimento</th>
                  <th>Litros</th>
                  <th>Código</th>
                  <th>Leitura original</th>
                  <th>Origem / avisos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((r) => (
                  <tr key={r.id}>
                    <td>{r.businessDate.split('-').reverse().join('/')}</td>
                    <td>{r.kind === 'legacy-in' ? 'Entrada' : 'Saída'}</td>
                    <td>{formatMilli(r.quantityMl)}</td>
                    <td>{r.assetId}</td>
                    <td>{r.legacyReading}</td>
                    <td>
                      {r.sourceSheet}:{r.sourceRow}:{r.sourceColumn}
                      <details>
                        <summary>Conferência</summary>
                        <p>{r.issues.join(' ') || 'Sem aviso na extração.'}</p>
                        <p>
                          Pessoa na origem ({r.sourcePersonLabel}):{' '}
                          {r.personName || 'Não informado'}. CR: {r.sourceUnit || 'Não informado'}.
                          Documento: {r.reference || 'Não informado'}.
                        </p>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
