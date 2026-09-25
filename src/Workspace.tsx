import { useEffect, useRef, useState, type FormEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getDatabase } from './firebase';
import { createCatalog, loadCatalog, productName, products, type Profile } from './data/catalog';
import { submitOperation } from './data/operations.mjs';
import { formatMilli, toMilli } from './domain/quantity.mjs';
import './workspace.css';

const errorMessage = (error: unknown) => {
  const code = (error as {code?:string}).code;
  if (code === 'permission-denied') return 'Acesso não autorizado. Verifique o perfil, a unidade e as regras publicadas.';
  if (code === 'unavailable') return 'Sem conexão com o servidor. A operação não foi confirmada; tente reenviar.';
  if (code === 'failed-precondition') return 'O banco requer configuração adicional. Verifique os índices e se o Firestore está habilitado.';
  return error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
};
const roleName = { admin:'Administrador', manager:'Responsável', operator:'Comboísta' };

export default function Workspace({user,onLogout}:{user:User;onLogout:()=>Promise<void>}) {
  const [profile,setProfile]=useState<Profile|null>(null);
  const [site,setSite]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=> {
    let cancelled=false; let unsubscribe:undefined|(()=>void);
    getDatabase().then(db=> {
      if(cancelled)return;
      unsubscribe=onSnapshot(doc(db,'users',user.uid), snap=> {
        const p=snap.data() as Profile|undefined;
        const valid=p?.active && ['admin','manager','operator'].includes(p.role) && Array.isArray(p.siteIds) && p.siteIds.every(id=>typeof id==='string' && id.length>0 && !id.includes('/'));
        setProfile(valid?p:null); setLoading(false);
        setSite(current=>valid && p.siteIds.includes(current)?current:valid?p.siteIds[0]??'':'');
      },e=>{setError(errorMessage(e));setLoading(false);setProfile(null);});
    }).catch(e=>{if(!cancelled){setError(errorMessage(e));setLoading(false);}});
    return ()=>{cancelled=true;unsubscribe?.();};
  },[user.uid]);
  return <div className="workspace">
    <header className="topbar"><div><strong>MACER</strong><span>Controle de combustível</span></div><button className="secondary" onClick={onLogout}>Sair</button></header>
    <div className="workspace-body">
      {loading?<p role="status">Carregando acesso…</p>:!profile?<section className="card"><h1>Acesso operacional pendente</h1><p>Sua conta precisa de um perfil ativo e de uma unidade autorizada. Solicite a liberação ao administrador.</p><p>{user.email}</p>{error&&<p role="alert" className="error">{error}</p>}</section>:<>
        <div className="page-heading"><div><p className="eyebrow">{roleName[profile.role]} · {profile.name}</p><h1>Operação de combustível</h1><p>Registre recebimentos e abastecimentos com o estoque atualizado.</p></div>
          <label>Unidade<select value={site} onChange={e=>setSite(e.target.value)}>{profile.siteIds.map(id=><option key={id}>{id}</option>)}</select></label></div>
        {site?<SiteWorkspace key={`${user.uid}:${site}:${profile.role}`} uid={user.uid} site={site} profile={profile}/>:<p>Nenhuma unidade autorizada.</p>}
      </>}
    </div>
  </div>;
}

function SiteWorkspace({uid,site,profile}:{uid:string;site:string;profile:Profile}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof loadCatalog>>>({tanks:[],assets:[],history:[]});
  const [tab,setTab]=useState('fuel');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [tankId,setTankId]=useState(''),[assetId,setAssetId]=useState('');
  const [queryText,setQueryText]=useState('');
  const [refresh,setRefresh]=useState(0);
  // Uma falha/reenvio do mesmo formulário conserva o mesmo ID.
  const pending=useRef<{signature:string;id:string}|null>(null);
  const inFlight=useRef(false);
  const storageKey=`macer-pending:${uid}:${site}`;
  const [recoverable,setRecoverable]=useState<string|null>(()=> {
    try{return localStorage.getItem(storageKey);}catch{return null;}
  });
  async function recover() {
    if(!recoverable||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try {
      const command=JSON.parse(recoverable);
      const id=await submitOperation(await getDatabase(),site,uid,command);
      localStorage.removeItem(storageKey);setRecoverable(null);
      setMessage(`Operação recuperada e confirmada. Protocolo: ${id}`);setRefresh(v=>v+1);
    }catch(e){
      const code=(e as {code?:string}).code;
      if(code==='permission-denied'||(!code&&e instanceof Error&&!(e instanceof DOMException))){localStorage.removeItem(storageKey);setRecoverable(null);}
      setError(errorMessage(e));
    }
    finally{inFlight.current=false;setBusy(false);}
  }
  useEffect(()=> {
    let current=true;setLoading(true);setError('');
    loadCatalog(site,uid,profile.role).then(result=>{if(current){setData(result);setLoading(false);}}).catch(e=>{if(current){setError(errorMessage(e));setLoading(false);}});
    return ()=>{current=false;};
  },[site,uid,profile.role,refresh]);
  const selectedTank=data.tanks.find(t=>t.id===tankId);
  const selectedAsset=data.assets.find(a=>a.id===assetId);
  const isManager=profile.role!=='operator';
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(inFlight.current||recoverable)return;
    const form=event.currentTarget, fields=new FormData(form);
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    try {
      if(tab==='assets') {
        const code=String(fields.get('code')).trim().toUpperCase();
        if(!/^[A-Z0-9-]{1,40}$/.test(code))throw new Error('Código: use letras, números e hífen, até 40 caracteres.');
        await createCatalog(site,'assets',code,{code,name:String(fields.get('name')).trim(),plate:String(fields.get('plate')).trim().toUpperCase(),product:String(fields.get('product')),capacityMl:toMilli(fields.get('capacity')),meter:fields.get('meter'),readingMilli:toMilli(fields.get('reading'))});
        setMessage('Ativo cadastrado.');form.reset();
      } else if(tab==='tanks') {
        await createCatalog(site,'tanks',crypto.randomUUID(),{name:String(fields.get('name')).trim(),product:String(fields.get('product')),capacityMl:toMilli(fields.get('capacity')),balanceMl:0});
        setMessage('Tanque cadastrado com saldo zero.');form.reset();
      } else {
        const command={kind:tab as 'fuel'|'receipt',tankId,assetId:tab==='fuel'?assetId:'',quantityMl:toMilli(fields.get('quantity')),readingMilli:tab==='fuel'?toMilli(fields.get('reading')):0,reference:String(fields.get('reference')??'').trim(),note:String(fields.get('note')??'').trim()};
        const signature=JSON.stringify(command);
        if(!pending.current || pending.current.signature!==signature)pending.current={signature,id:crypto.randomUUID()};
        const payload={...command,id:pending.current.id};
        // Persistir antes do envio; nunca criar outro ID após resposta incerta.
        const serialized=JSON.stringify(payload);
        localStorage.setItem(storageKey,serialized);setRecoverable(serialized);
        const id=await submitOperation(await getDatabase(),site,uid,payload);
        localStorage.removeItem(storageKey);setRecoverable(null);
        setMessage(`Operação confirmada. Protocolo: ${id}`);
        // Mantém o ID até o formulário mudar: repetir a confirmação não cria baixa.
      }
      setRefresh(v=>v+1);
    }catch(e){
      // Falhas definitivas permitem corrigir o formulário. Falhas de rede preservam o ID.
      const code=(e as {code?:string}).code;
      if(code==='permission-denied' || (!code && e instanceof Error && !(e instanceof DOMException))) {
        localStorage.removeItem(storageKey);setRecoverable(null);
      }
      setError(errorMessage(e));
    }
    finally{inFlight.current=false;setBusy(false);}
  }
  return <>
    <nav className="tabs" aria-label="Operação">
      {[['fuel','Abastecer'],...(isManager?[['receipt','Receber combustível']]:[]),['history','Histórico'],...(profile.role==='admin'?[['assets','Cadastrar ativo'],['tanks','Cadastrar tanque']]:[])].map(([id,label])=><button key={id} className={tab===id?'selected':''} aria-pressed={tab===id} disabled={busy} onClick={()=>{setTab(id);setError('');setMessage('');}}>{label}</button>)}
    </nav>
    {message&&<p className="success" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
    {recoverable&&!busy&&<section className="card"><h2>Confirmação pendente</h2><p>Existe um envio sem confirmação neste aparelho. Recupere o resultado antes de iniciar outra operação nesta unidade.</p><button onClick={recover}>Recuperar confirmação</button></section>}
    {message&&pending.current&&!recoverable&&<button className="secondary" onClick={()=>{pending.current=null;setMessage('');}}>Iniciar novo lançamento</button>}
    <div className="operation-layout"><section className="card">
      {loading?<p role="status">Atualizando dados…</p>:tab==='history'?<>
        <h2>{isManager?'Movimentações recentes':'Meus lançamentos'}</h2><p className="muted">Últimos 50 registros da unidade, mais recentes primeiro.</p>
        <div className="table-scroll"><table><thead><tr><th>Data</th><th>Operação</th><th>Destino</th><th>Litros</th></tr></thead><tbody>{data.history.map(op=><tr key={op.id}><td>{op.createdAt?.toDate().toLocaleString('pt-BR')??'Aguardando data'}</td><td>{op.kind==='fuel'?'Abastecimento':'Recebimento'}<small>{productName(op.product)}</small></td><td>{op.assetId||data.tanks.find(t=>t.id===op.tankId)?.name||op.tankId}</td><td>{formatMilli(op.quantityMl)}</td></tr>)}</tbody></table></div>{data.history.length===0&&<p>Nenhum lançamento disponível.</p>}
      </>:<form key={tab} onSubmit={submit}><fieldset disabled={busy||Boolean(recoverable)}>
        <h2>{{fuel:'Novo abastecimento',receipt:'Recebimento no tanque',assets:'Novo ativo',tanks:'Novo tanque'}[tab]}</h2>
        {(tab==='fuel'||tab==='receipt')?<>
          <label htmlFor="tank">Tanque de estoque</label><select id="tank" required value={tankId} onChange={e=>{setTankId(e.target.value);setAssetId('');}}><option value="">Selecione</option>{data.tanks.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.name} · {productName(t.product)}</option>)}</select>
          {selectedTank&&<p className="muted">Saldo consultado: {formatMilli(selectedTank.balanceMl)} L. O servidor verifica novamente ao confirmar.</p>}
          {tab==='fuel'?<>
            <label htmlFor="search">Pesquisar código, placa ou nome</label><input id="search" value={queryText} onChange={e=>setQueryText(e.target.value)}/>
            <label htmlFor="asset">Ativo</label><select id="asset" required value={assetId} onChange={e=>setAssetId(e.target.value)}><option value="">Selecione</option>{data.assets.filter(a=>a.active&&a.product===selectedTank?.product&&(a.id===assetId||`${a.code} ${a.plate} ${a.name}`.toLowerCase().includes(queryText.toLowerCase()))).map(a=><option value={a.id} key={a.id}>{a.code} · {a.name} {a.plate}</option>)}</select>
            <label htmlFor="reading">Leitura {selectedAsset?.meter==='km'?'do hodômetro (km)':'do horímetro (h)'}</label><input id="reading" name="reading" inputMode="decimal" required/>
            {selectedAsset&&<p className="muted">Última leitura: {formatMilli(selectedAsset.readingMilli)} {selectedAsset.meter==='km'?'km':'h'}</p>}
          </>:<><label htmlFor="reference">Documento ou referência do recebimento</label><input id="reference" name="reference" maxLength={120} required/></>}
          <label htmlFor="quantity">Quantidade (litros)</label><input id="quantity" name="quantity" inputMode="decimal" required/>
          <label htmlFor="note">Observação</label><textarea id="note" name="note" maxLength={500} rows={3}/>
          <p className="muted">Registro online com data e usuário automáticos. Até três casas decimais.</p>
        </>:<>
          {tab==='assets'&&<><label htmlFor="code">Código único</label><input id="code" name="code" maxLength={40} required/><label htmlFor="plate">Placa (opcional)</label><input id="plate" name="plate" maxLength={20}/></>}
          <label htmlFor="name">Nome</label><input id="name" name="name" maxLength={100} required/>
          <label htmlFor="product">Produto</label><select id="product" name="product">{Object.entries(products).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select>
          <label htmlFor="capacity">Capacidade (litros)</label><input id="capacity" name="capacity" inputMode="decimal" required/>
          {tab==='assets'&&<><label htmlFor="meter">Medidor</label><select id="meter" name="meter"><option value="hours">Horímetro (h)</option><option value="km">Hodômetro (km)</option></select><label htmlFor="initial-reading">Leitura inicial</label><input id="initial-reading" name="reading" inputMode="decimal" required/></>}
        </>}
        <button type="submit" disabled={busy}>{busy?'Confirmando…':tab==='fuel'?'Confirmar abastecimento':tab==='receipt'?'Confirmar recebimento':'Salvar cadastro'}</button>
      </fieldset></form>}
    </section><aside className="card"><div className="aside-heading"><h2>Estoque por tanque</h2><button className="secondary" disabled={busy||loading} onClick={()=>setRefresh(v=>v+1)}>Atualizar</button></div>
      {data.tanks.length===0?<p className="muted">Nenhum tanque cadastrado nesta unidade.</p>:data.tanks.map(t=><div className="tank-summary" key={t.id}><strong>{t.name}</strong><span>{productName(t.product)}</span><b>{formatMilli(t.balanceMl)} <small>L</small></b><span>Capacidade: {formatMilli(t.capacityMl)} L</span></div>)}
      <p className="muted">Saldos calculados; não substituem a medição física.</p>
      {(data.assets.length===200||data.tanks.length===200)&&<p role="status">Limite de 200 cadastros carregados. A pesquisa cobre somente esta seleção.</p>}
    </aside></div>
  </>;
}
