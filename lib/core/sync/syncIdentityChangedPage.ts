import type { DbPort, DbRow } from './dbPort.js';
import { assertReadySyncIdentityIndex } from './syncIdentityIndexMaintenance.js';

export interface SyncIdentityChangedCursor {
  updated_at: string;
  object_type: string;
  object_id: string;
}

export interface SyncIdentityChangedEntry extends SyncIdentityChangedCursor {
  fingerprint: string;
}

export interface SyncIdentityChangedRemotePage {
  contract: string;
  source_view_id: string;
  entries: SyncIdentityChangedEntry[];
  nextAfter: SyncIdentityChangedCursor | null;
}

function compareCursor(left: SyncIdentityChangedCursor, right: SyncIdentityChangedCursor) {
  for (const key of ['updated_at', 'object_type', 'object_id'] as const) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

export function validateSyncIdentityChangedRemotePage(page: SyncIdentityChangedRemotePage,
  viewId: string, after: SyncIdentityChangedCursor | null) {
  if (page.contract !== 'global-id-v1' || page.source_view_id !== viewId ||
      !Array.isArray(page.entries) || page.entries.length > 128 ||
      new TextEncoder().encode(JSON.stringify(page.entries)).length > 65536 ||
      page.nextAfter !== null && (!page.nextAfter ||
        typeof page.nextAfter.updated_at !== 'string' ||
        typeof page.nextAfter.object_type !== 'string' ||
        typeof page.nextAfter.object_id !== 'string') ||
      page.entries.some((entry, index) => !entry ||
        typeof entry.updated_at !== 'string' || entry.updated_at.length > 128 ||
        typeof entry.object_type !== 'string' || !entry.object_type || entry.object_type.length > 128 ||
        typeof entry.object_id !== 'string' || !entry.object_id || entry.object_id.length > 2048 ||
        typeof entry.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.fingerprint) ||
        compareCursor(entry, index ? page.entries[index - 1]! : after ?? entry) < (index || after ? 1 : 0)) ||
      page.nextAfter && (!page.entries.length ||
        compareCursor(page.nextAfter, page.entries.at(-1)!) !== 0)) {
    throw new Error('sync_identity_changed_remote_page_invalid');
  }
}

interface ChangedRow extends DbRow, SyncIdentityChangedCursor {
  fingerprint: string;
}

export async function readReadySyncIdentityChangedPage(port: DbPort, since: string,
  after: SyncIdentityChangedCursor | null, limit = 128, schema = 'main') {
  if (typeof since !== 'string' || since.length > 128 ||
      after && (!after.object_type || !after.object_id || after.updated_at.length > 128 ||
        after.object_type.length > 128 || after.object_id.length > 2048)) {
    throw new Error('sync_identity_changed_page_invalid');
  }
  const pageLimit = Math.max(1, Math.min(128, Math.trunc(limit)));
  return port.transaction(async (tx) => {
    await assertReadySyncIdentityIndex(tx, schema);
    if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
    const where = after ? 'AND (updated_at, object_type, object_id) > (?, ?, ?)' : '';
    const params = after ? [since, after.updated_at, after.object_type, after.object_id,
      pageLimit + 1] : [since, pageLimit + 1];
    const rows = await tx.query<ChangedRow>(`SELECT updated_at, object_type, object_id,
      fingerprint FROM ${schema}.sync_identity_index_rows WHERE updated_at >= ? ${where}
      ORDER BY updated_at, object_type, object_id LIMIT ?`, params);
    const entries: ChangedRow[] = [];
    let bytes = 2;
    for (const row of rows.slice(0, pageLimit)) {
      const size = new TextEncoder().encode(JSON.stringify(row)).length + 1;
      if (bytes + size > 65536) {
        if (!entries.length) throw new Error('sync_identity_changed_item_too_large');
        break;
      }
      entries.push(row);
      bytes += size;
    }
    const last = entries.at(-1);
    return { entries, nextAfter: rows.length > entries.length && last ? {
      updated_at: last.updated_at, object_type: last.object_type, object_id: last.object_id
    } : null };
  });
}
