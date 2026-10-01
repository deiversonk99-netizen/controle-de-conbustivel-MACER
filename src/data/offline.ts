export type Queued = {
  id: string;
  uid: string;
  site: string;
  command: any;
  photo?: string;
  operationConfirmed?: boolean;
  published?: boolean;
  state: 'queued' | 'conflict' | 'synced' | 'resolved';
  error?: string;
  queuedAt: number;
};
let opening: Promise<IDBDatabase>;
function database() {
  return (opening ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('macer-offline-v2', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('queue', { keyPath: 'id' });
      r.result.createObjectStore('cache');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function access(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
) {
  const db = await database();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    let value: any;
    request.onsuccess = () => (value = request.result);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('Não foi possível salvar no aparelho.'));
  });
}
export const cachePut = (key: string, value: any) =>
  access('cache', 'readwrite', (s) => s.put(value, key));
export const cacheGet = (key: string) => access('cache', 'readonly', (s) => s.get(key));
export const queuePut = (item: Queued) => access('queue', 'readwrite', (s) => s.put(item));
export async function queueList(uid: string, site?: string): Promise<Queued[]> {
  return (await access('queue', 'readonly', (s) => s.getAll()))
    .filter((q: Queued) => q.uid === uid && (!site || q.site === site))
    .sort((a: Queued, b: Queued) => a.queuedAt - b.queuedAt);
}
export const queueRemove = (id: string) => access('queue', 'readwrite', (s) => s.delete(id));
export async function migrateLegacy(uid: string, site: string) {
  const key = `macer-pending:${uid}:${site}`,
    raw = localStorage.getItem(key);
  if (!raw) return;
  const command = JSON.parse(raw);
  if (typeof command.id !== 'string')
    throw Error('Registro antigo sem protocolo. Exporte uma cópia antes de corrigir.');
  if (!(await queueList(uid, site)).some((q) => q.id === command.id))
    await queuePut({ id: command.id, uid, site, command, state: 'queued', queuedAt: Date.now() });
  localStorage.removeItem(key);
}
export async function compactPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw Error('Selecione uma imagem.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.75, 0.6, 0.45, 0.3]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length <= 160000) return data;
  }
  throw Error('Foto muito grande após compactação. Aproxime o medidor e tente novamente.');
}
