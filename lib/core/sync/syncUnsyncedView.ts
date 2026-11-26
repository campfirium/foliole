import type { DbPort } from './dbPort.js';
import { loadSyncUnsyncedItems, syncUnsyncedIdentity, type SyncUnsyncedItem } from './syncUnsyncedItems.js';

/** `title` is null when this device has no openable content for the item. */
export type SyncUnsyncedViewItem = SyncUnsyncedItem & { peerDeviceId: string; title: string | null };

export async function loadSyncUnsyncedView(db: DbPort): Promise<SyncUnsyncedViewItem[]> {
  const records = await loadSyncUnsyncedItems(db);
  const items = records.flatMap(record => record.items.map(item => ({ ...item, peerDeviceId: record.peerDeviceId })));
  if (!items.length) return [];
  const rows = await db.query<{ id: string; title: string | null }>(
    'SELECT id, title FROM nodes WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(items.map(item => item.globalId))]);
  const titles = new Map(rows.map(row => [row.id, row.title ?? '']));
  return items.map(item => ({ ...item, title: titles.get(item.globalId) ?? null }));
}

export function countSyncUnsyncedItems(items: readonly SyncUnsyncedViewItem[]) {
  return new Set(items.map(syncUnsyncedIdentity)).size;
}

/** Support details: identities and codes only, never titles or bodies. */
export function formatSyncUnsyncedReport(items: readonly SyncUnsyncedViewItem[], appVersion: string) {
  return [`Foliole ${appVersion} unsynced items: ${items.length}`, ...items.map(item => [
    `type=${item.objectType}`, `id=${item.globalId}`, `code=${item.code}`, `stage=${item.stage}`,
    `failed_on=${item.side === 'self' ? 'this_device' : 'peer'}`, `peer=${item.peerDeviceId}`,
    `first_seen=${item.firstSeenAt}`
  ].join(' '))].join('\n');
}
