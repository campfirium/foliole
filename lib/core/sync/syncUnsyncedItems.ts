import type { DbPort } from './dbPort.js';
import { REQUEST_SYNC_WRITE_REJECTED } from './requestSyncObjectWriteIsolation.js';

/** One item that did not sync with one peer. Holds identity and a stable code only, never content. */
export type SyncUnsyncedItem = {
  objectType: string;
  globalId: string;
  code: string;
  /** The side that failed, seen from the device holding the record. */
  side: 'self' | 'peer';
  stage: 'prepare' | 'apply' | 'dependency' | 'inventory';
  firstSeenAt: string;
};
export type SyncUnsyncedFailure = Omit<SyncUnsyncedItem, 'firstSeenAt'>;
export type SyncUnsyncedUpdate = {
  failed: readonly SyncUnsyncedFailure[];
  /** Earlier items to keep unless they failed again; every other earlier item is resolved. */
  keep(item: SyncUnsyncedItem): boolean;
};

const PREFIX = 'sync_unsynced:';
/** The exclusive upper bound of the keys that start with the prefix. */
const PREFIX_END = 'sync_unsynced;';

export const syncUnsyncedIdentity = (item: { objectType: string; globalId: string }) =>
  `${item.objectType}\0${item.globalId}`;

/** Only our own stable codes leave the diagnostic log; free exception text stays there. */
export function syncUnsyncedCode(error: string) {
  const detail = error.replace(/^framed_sync_http_400:/u, '').replace(REQUEST_SYNC_WRITE_REJECTED, '').replace(/^:/u, '');
  if (/constraint failed/iu.test(detail)) return 'sync_item_constraint_failed';
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?=:|$)/u.exec(detail)?.[0] ?? 'sync_item_failed';
}

export async function loadSyncUnsyncedItems(db: DbPort) {
  const rows = await db.query<{ key: string; value: string }>(
    'SELECT key, value FROM sync_group_metadata WHERE key >= ? AND key < ? ORDER BY key', [PREFIX, PREFIX_END]);
  return rows.map(row => ({ peerDeviceId: row.key.slice(PREFIX.length), items: JSON.parse(row.value) as SyncUnsyncedItem[] }));
}

export async function loadPeerSyncUnsyncedItems(db: DbPort, peerDeviceId: string) {
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?',
    [`${PREFIX}${peerDeviceId}`]);
  return row ? JSON.parse(row.value) as SyncUnsyncedItem[] : [];
}

/** The next record, or null when nothing about it changes. First-seen times survive later failures. */
export function mergeSyncUnsyncedItems(previous: readonly SyncUnsyncedItem[], update: SyncUnsyncedUpdate,
  now = new Date().toISOString()) {
  const earlier = new Map(previous.map(item => [syncUnsyncedIdentity(item), item]));
  const next = new Map(previous.filter(item => update.keep(item)).map(item => [syncUnsyncedIdentity(item), item]));
  for (const failure of update.failed) {
    const identity = syncUnsyncedIdentity(failure);
    next.set(identity, { ...failure, firstSeenAt: earlier.get(identity)?.firstSeenAt ?? now });
  }
  const items = [...next.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([, item]) => item);
  return JSON.stringify(items) === JSON.stringify(previous) ? null : items;
}

export async function saveSyncUnsyncedItems(db: DbPort, peerDeviceId: string, items: readonly SyncUnsyncedItem[]) {
  const key = `${PREFIX}${peerDeviceId}`;
  if (!items.length) {
    await db.run('DELETE FROM sync_group_metadata WHERE key = ?', [key]);
    return;
  }
  await db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  [key, JSON.stringify(items), new Date().toISOString()]);
}

export async function clearSyncUnsyncedItems(db: DbPort) {
  await db.run('DELETE FROM sync_group_metadata WHERE key >= ? AND key < ?', [PREFIX, PREFIX_END]);
}

type RecordHost = {
  readSnapshot<T>(read: (db: DbPort) => Promise<T>, signal?: AbortSignal): Promise<T>;
  write<T>(write: (db: DbPort) => Promise<T>): Promise<T>;
};

/** Takes the writer only when the record really changes. Returns whether it did. */
export async function updateSyncUnsyncedItems(host: RecordHost, peerDeviceId: string, update: SyncUnsyncedUpdate) {
  const current = await host.readSnapshot(db => loadPeerSyncUnsyncedItems(db, peerDeviceId));
  if (!mergeSyncUnsyncedItems(current, update)) return false;
  return host.write(db => db.transaction(async tx => {
    const next = mergeSyncUnsyncedItems(await loadPeerSyncUnsyncedItems(tx, peerDeviceId), update);
    if (next) await saveSyncUnsyncedItems(tx, peerDeviceId, next);
    return Boolean(next);
  }));
}
