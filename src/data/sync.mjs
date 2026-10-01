// Store every command before dispatch. A retry always uses the same operation ID.
export async function drain({ uid, site, list, put, execute, photo, pending, online, isCurrent }) {
  for (const item of await list(uid, site)) {
    if (!online() || !isCurrent()) break;
    if (item.state === 'synced' || item.state === 'resolved') continue;
    if (item.state === 'conflict') {
      if (!item.published) {
        try {
          await pending(item);
          await put({ ...item, published: true });
        } catch {
          /* Retry later. */
        }
      }
      continue;
    }
    try {
      if (!item.operationConfirmed) {
        await execute(item.command);
        item.operationConfirmed = true;
        await put(item);
      }
      if (item.photo) await photo(item.id, item.photo);
      await put({ ...item, state: 'synced', error: '' });
    } catch (error) {
      const retry =
        [
          'unavailable',
          'deadline-exceeded',
          'aborted',
          'resource-exhausted',
          'unauthenticated',
          'auth/network-request-failed',
        ].includes(error.code) || !online();
      const updated = {
        ...item,
        state: retry ? 'queued' : 'conflict',
        error: error.message || String(error),
      };
      await put(updated);
      if (!retry && isCurrent()) {
        try {
          await pending(updated);
          await put({ ...updated, published: true });
        } catch {
          /* Local record remains authoritative for the outbox. */
        }
      }
      if (retry) break;
    }
  }
}
