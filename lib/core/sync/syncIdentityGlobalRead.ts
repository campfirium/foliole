import type { DbPort, DbRow } from './dbPort.js';
import { createSyncIdentityDigest, type SyncIdentityEntry } from './syncIdentityDigest.js';
import { assertReadySyncIdentityIndex } from './syncIdentityIndexMaintenance.js';

interface IndexRow extends SyncIdentityEntry, DbRow {}
const encoder = new TextEncoder();

function alias(schema: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  return schema;
}

/** Summarize the complete fixed view without keeping its rows in memory. */
export async function readReadySyncIdentityInventory(port: DbPort, schema = 'main') {
  const source = alias(schema);
  await assertReadySyncIdentityIndex(port, source);
  const digest = createSyncIdentityDigest();
  let after: Pick<IndexRow, 'object_type' | 'object_id'> | null = null;
  let rowCount = 0;
  for (;;) {
    const rows: IndexRow[] = await port.query<IndexRow>(`SELECT object_type, object_id, fingerprint
      FROM ${source}.sync_identity_index_rows
      WHERE (object_type, object_id) > (?, ?)
      ORDER BY object_type, object_id LIMIT 128`,
    [after?.object_type ?? '', after?.object_id ?? '']);
    for (const row of rows) digest.add(row);
    rowCount += rows.length;
    if (rows.length < 128) break;
    after = rows.at(-1)!;
  }
  return { digest: digest.finish(), row_count: rowCount };
}

/** Read a row and byte bounded page in global (type, ID) order. */
export async function readReadySyncIdentityGlobalPage(port: DbPort,
  after: { object_type: string; object_id: string } | null, schema = 'main') {
  if (after && (!after.object_type || !after.object_id ||
      after.object_type.length > 128 || after.object_id.length > 2048)) {
    throw new Error('sync_identity_global_page_invalid');
  }
  const source = alias(schema);
  await assertReadySyncIdentityIndex(port, source);
  const rows = await port.query<IndexRow>(`SELECT object_type, object_id, fingerprint
    FROM ${source}.sync_identity_index_rows
    WHERE (object_type, object_id) > (?, ?)
    ORDER BY object_type, object_id LIMIT 129`,
  [after?.object_type ?? '', after?.object_id ?? '']);
  const entries: SyncIdentityEntry[] = [];
  for (const row of rows.slice(0, 128)) {
    if (encoder.encode(JSON.stringify([...entries, row])).length > 65536) {
      if (!entries.length) throw new Error('sync_identity_global_item_too_large');
      break;
    }
    entries.push({ object_type: row.object_type, object_id: row.object_id,
      fingerprint: row.fingerprint });
  }
  return { entries, nextAfter: rows.length > entries.length ? {
    object_type: entries.at(-1)!.object_type, object_id: entries.at(-1)!.object_id
  } : null };
}
