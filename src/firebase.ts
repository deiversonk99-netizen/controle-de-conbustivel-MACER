import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import publicConfig from './firebase-public-config.json';

const environmentConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// A hospedagem pode injetar todas as variáveis vazias. Nesse caso usar o
// conjunto público completo; nunca misturar identificadores de dois projetos.
const config = Object.values(environmentConfig).some(value => typeof value === 'string' && value.trim())
  ? environmentConfig : publicConfig;

export const firebaseConfigured = Object.values(config).every(
  value => typeof value === 'string' && value.trim().length > 0,
);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true';
if (useEmulators && !config.projectId.startsWith('demo-')) throw new Error('Emuladores exigem projectId demo-.');
if (useEmulators && auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
let databaseConnected = false;
// Carregar o SDK de dados só quando um módulo operacional precisar dele.
export async function getDatabase() {
  if (!app) throw new Error('Firebase não configurado.');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const db = getFirestore(app);
  if (useEmulators && !databaseConnected) { connectFirestoreEmulator(db, '127.0.0.1', 8080); databaseConnected = true; }
  return db;
}
// Storage não é inicializado: anexos dependem da decisão sobre faturamento.
