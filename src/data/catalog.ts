import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { getDatabase } from '../firebase';
export type Profile = {
  name: string;
  active: boolean;
  role: 'admin' | 'manager' | 'operator';
  siteIds: string[];
  canCreateSites?: boolean;
};
export type Tank = {
  id: string;
  name: string;
  product: string;
  capacityMl: number;
  balanceMl: number;
  active: boolean;
};
export type Asset = {
  id: string;
  code: string;
  name: string;
  plate: string;
  product: string;
  capacityMl: number;
  meter: 'hours' | 'km';
  readingMilli: number;
  active: boolean;
};
export type Operation = {
  id: string;
  kind: 'fuel' | 'receipt';
  tankId: string;
  assetId: string;
  product: string;
  quantityMl: number;
  createdAt?: { toDate(): Date };
  createdBy: string;
  reference: string;
};
export const products = {
  'diesel-s10': 'Diesel S10',
  'diesel-s500': 'Diesel S500',
  arla32: 'ARLA 32',
};
export const productName = (id: string) => products[id as keyof typeof products] ?? id;
export async function loadCatalog(site: string, uid: string, role: Profile['role']) {
  const db = await getDatabase();
  const operations = collection(db, 'sites', site, 'operations');
  const [tanks, assets, history] = await Promise.all([
    getDocs(query(collection(db, 'sites', site, 'tanks'), orderBy('name'), limit(200))),
    getDocs(query(collection(db, 'sites', site, 'assets'), orderBy('code'), limit(200))),
    getDocs(
      query(
        operations,
        ...(role === 'operator' ? [where('createdBy', '==', uid)] : []),
        orderBy('createdAt', 'desc'),
        limit(50),
      ),
    ),
  ]);
  return {
    tanks: tanks.docs.map((d) => ({ ...d.data(), id: d.id }) as Tank),
    assets: assets.docs.map((d) => ({ ...d.data(), id: d.id }) as Asset),
    history: history.docs.map((d) => ({ ...d.data(), id: d.id }) as Operation),
  };
}
export async function createCatalog(
  site: string,
  kind: 'assets' | 'tanks',
  id: string,
  data: Record<string, unknown>,
) {
  const db = await getDatabase();
  const ref = doc(db, 'sites', site, kind, id);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error('Já existe um cadastro com esse código.');
    tx.set(ref, {
      ...data,
      active: true,
      version: 0,
      lastOperationId: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
