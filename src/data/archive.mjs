import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { normalizePackage, rowHash, sameArchivedRow } from '../domain/archive.mjs';

export async function importArchive(
  db,
  site,
  uid,
  raw,
  selection,
  progress = (_value) => {},
  cancelled = () => false,
) {
  const p = normalizePackage(raw);
  const rows = p.records.filter((r) => selection.includes(r.sourceSheet));
  if (!rows.length) throw Error('Selecione ao menos uma aba com movimentos.');
  const manifestRef = doc(db, 'sites', site, 'imports', p.sourceHash);
  let inserted = 0,
    skipped = 0;
  for (let offset = 0; offset < rows.length; offset += 20) {
    if (cancelled()) return { inserted, skipped, stopped: true };
    // Recheck access on each batch, and keep all reads before writes inside the transaction.
    const profile = (await getDocFromServer(doc(db, 'users', uid))).data();
    if (!profile?.active || profile.role !== 'admin' || !profile.siteIds?.includes(site))
      throw Error('Somente o administrador da unidade pode importar.');
    const chunk = await Promise.all(
      rows.slice(offset, offset + 20).map(async (r) => ({ ...r, contentHash: await rowHash(r) })),
    );
    const result = await runTransaction(db, async (tx) => {
      const manifest = await tx.get(manifestRef);
      const refs = chunk.map((r) => doc(db, 'sites', site, 'legacyHistory', r.id));
      const snapshots = [];
      for (const ref of refs) snapshots.push(await tx.get(ref));
      for (let i = 0; i < chunk.length; i++) {
        if (
          snapshots[i].exists() &&
          !sameArchivedRow({ id: chunk[i].id, ...snapshots[i].data() }, chunk[i])
        )
          throw Error(
            `A origem ${chunk[i].sourceSheet}, linha ${chunk[i].sourceRow}, já foi importada com outros valores. Nenhum registro deste lote foi alterado.`,
          );
      }
      if (!manifest.exists())
        tx.set(manifestRef, {
          sourceName: p.sourceName,
          sourceHash: p.sourceHash,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
      let count = 0;
      chunk.forEach(({ id, ...row }, i) => {
        if (!snapshots[i].exists()) {
          tx.set(refs[i], {
            ...row,
            sourceHash: p.sourceHash,
            importedBy: uid,
            importedAt: serverTimestamp(),
          });
          count++;
        }
      });
      return count;
    });
    inserted += result;
    skipped += chunk.length - result;
    progress({ inserted, skipped, processed: offset + chunk.length, total: rows.length });
  }
  return { inserted, skipped, stopped: false };
}
