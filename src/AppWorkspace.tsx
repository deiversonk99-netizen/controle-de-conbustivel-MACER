import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getDatabase } from './firebase';
import type { Profile } from './data/catalog';
import { cacheGet, cachePut, queueList } from './data/offline';
import OperationsUI from './OperationsUI';
import './workspace.css';
export default function AppWorkspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [site, setSite] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => setReady(true));
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, []);
  useEffect(() => {
    let cancelled = false,
      unsubscribe: (() => void) | undefined;
    const apply = (p: Profile | null) => {
      if (cancelled) return;
      const valid =
        p?.active && ['admin', 'manager', 'operator'].includes(p.role) && Array.isArray(p.siteIds);
      setProfile(valid ? p : null);
      setSite((s) => (valid && p.siteIds.includes(s) ? s : valid ? p.siteIds[0] || '' : ''));
      setLoading(false);
    };
    cacheGet('profile:' + user.uid)
      .then((p) => {
        if (!navigator.onLine) apply(p || null);
      })
      .catch((e) => setError(e.message));
    getDatabase()
      .then((db) => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, 'users', user.uid),
          { includeMetadataChanges: true },
          (s) => {
            if (s.metadata.fromCache) return;
            const p = s.exists() ? (s.data() as Profile) : null;
            apply(p);
            cachePut('profile:' + user.uid, p).catch((e) => setError(e.message));
          },
          (e) => {
            if (navigator.onLine) {
              apply(null);
              setError(e.message);
            }
          },
        );
      })
      .catch((e) => {
        setLoading(false);
        setError(e.message);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user.uid, online]);
  async function logout() {
    const pending = (await queueList(user.uid)).filter(
      (q) => !['synced', 'resolved'].includes(q.state),
    );
    if (
      pending.length &&
      !window.confirm(
        `Há ${pending.length} registros neste aparelho aguardando sincronização. Eles permanecerão vinculados a esta conta. Deseja sair?`,
      )
    )
      return;
    await onLogout();
  }
  return (
    <div className="workspace">
      <header className="topbar">
        <div>
          <strong>MACER</strong>
          <span>Controle de combustível</span>
        </div>
        <button className="secondary" onClick={() => logout().catch((e) => setError(e.message))}>
          Sair
        </button>
      </header>
      <div className="workspace-body">
        <div className={'connection ' + (online ? '' : 'offline')} role="status">
          {online ? 'Conectado' : 'Sem internet · registros ficam neste aparelho'} ·{' '}
          {ready ? 'Aplicação disponível offline' : 'Preparando aplicação para uso offline'}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p>Verificando acesso…</p>
        ) : !profile ? (
          <section className="card">
            <h1>Acesso pendente</h1>
            <p>Entre uma primeira vez com internet e um perfil ativo autorizado. {user.email}</p>
          </section>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {
                    { admin: 'Administrador', manager: 'Responsável', operator: 'Comboísta' }[
                      profile.role
                    ]
                  }{' '}
                  · {profile.name}
                </p>
                <h1>Controle de combustível</h1>
              </div>
              <label>
                Unidade
                <select value={site} onChange={(e) => setSite(e.target.value)}>
                  {profile.siteIds.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            {site && (
              <OperationsUI
                key={`${user.uid}:${site}:${profile.role}`}
                uid={user.uid}
                site={site}
                profile={profile}
                online={online}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
