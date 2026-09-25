import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase';
import './style.css';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, value => { setUser(value); setLoading(false); }, () => {
      setError('Não foi possível verificar sua sessão. Recarregue a página.');
      setLoading(false);
    });
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { await signInWithEmailAndPassword(auth, String(data.get('email')).trim(), String(data.get('password'))); }
    catch { setError('Não foi possível entrar. Confira suas credenciais e sua conexão.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!auth) return;
    setError(''); setBusy(true);
    try { await signOut(auth); }
    catch { setError('Não foi possível sair. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <main>
    <section className="intro">
      <div className="brand">MACER<span>OPERAÇÕES</span></div>
      <div><p className="eyebrow">CONTROLE DE COMBUSTÍVEL</p><h1>A operação começa<br />com um registro confiável.</h1><p className="description">Abastecimentos, movimentações e conferência de estoque em um só lugar.</p></div>
      <p className="footnote">Ambiente inicial de desenvolvimento</p>
    </section>
    <section className="access" aria-label="Acesso ao sistema">
      <div className="panel">
        <p className="eyebrow">ACESSO DA EQUIPE</p>
        <h2>{user ? 'Sessão iniciada' : 'Entre na sua conta'}</h2>
        {!firebaseConfigured ? <p role="status">A conexão com o Firebase ainda precisa ser configurada neste ambiente.</p> : loading ? <p role="status">Verificando sessão…</p> : user ? <>
          <p>{user.email}</p><p>Os módulos operacionais ainda estão em desenvolvimento. Nenhum lançamento pode ser registrado nesta versão.</p>
          <button onClick={logout} disabled={busy}>Sair da conta</button>
        </> : <form onSubmit={login}>
          <label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" required disabled={busy} />
          <label htmlFor="password">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={busy} />
          <button disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          <p className="help">Use a conta disponibilizada pelo administrador.</p>
        </form>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="notice">Versão inicial · Operação e importação ainda não habilitadas.</p>
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
