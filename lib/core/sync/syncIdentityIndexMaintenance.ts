import type { DbParams, DbPort, DbRow } from './dbPort.js';
import {
  createSyncIdentityDigest, syncIdentityFingerprint, syncIdentityPartition,
  type SyncIdentityEntry, type SyncIdentityState
} from './syncIdentityDigest.js';

interface StateRow extends SyncIdentityState, DbRow {
  updated_at: string;
}

interface IndexRow extends SyncIdentityEntry, DbRow {
  partition: number;
}

interface IndexPageRow extends SyncIdentityEntry, DbRow {
  updated_at: string;
}

interface MetaRow extends DbRow {
  backfill_complete: number;
  last_object_id: string | null;
  last_object_type: string | null;
}

export type SyncIdentityEligibility = (port: DbPort, state: StateRow) => Promise<boolean>;

function pageSize(limit: number) {
  return Math.max(1, Math.min(256, Math.trunc(limit)));
}

async function statePage(port: DbPort, after: { object_type: string; object_id: string } | null,
  limit: number) {
  const where = after ? `WHERE object_type > ? OR (object_type = ? AND object_id > ?)` : '';
  const params = after ? [after.object_type, after.object_type, after.object_id, limit] : [limit];
  return port.query<StateRow>(`SELECT object_type, object_id, current_version_id, content_hash,
    updated_at, deleted_at FROM sync_object_state ${where}
    ORDER BY object_type, object_id LIMIT ?`, params);
}

async function invalidatePartition(port: DbPort, partition: number) {
  await port.run(`INSERT INTO sync_identity_partition_digest (partition, digest, row_count)
    VALUES (?, NULL, 0) ON CONFLICT(partition) DO UPDATE SET digest = NULL`, [partition]);
}

async function updateIndexKey(port: DbPort, state: StateRow | null, objectType: string,
  objectId: string, eligible: SyncIdentityEligibility) {
  const [old] = await port.query<IndexRow>(`SELECT partition FROM sync_identity_index_rows
    WHERE object_type = ? AND object_id = ?`, [objectType, objectId]);
  if (!state || !await eligible(port, state)) {
    if (old) {
      await port.run(`DELETE FROM sync_identity_index_rows
        WHERE object_type = ? AND object_id = ?`, [objectType, objectId]);
      await invalidatePartition(port, old.partition);
    }
    return;
  }
  const partition = syncIdentityPartition(objectType, objectId);
  await port.run(`INSERT INTO sync_identity_index_rows
    (object_type, object_id, partition, fingerprint, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(object_type, object_id) DO UPDATE SET partition = excluded.partition,
      fingerprint = excluded.fingerprint, updated_at = excluded.updated_at`,
  [objectType, objectId, partition, syncIdentityFingerprint(state), state.updated_at]);
  await invalidatePartition(port, partition);
  if (old && old.partition !== partition) await invalidatePartition(port, old.partition);
}

export async function backfillSyncIdentityIndexPage(port: DbPort, eligible: SyncIdentityEligibility,
  limit = 128) {
  return port.transaction(async (tx) => {
    const [meta] = await tx.query<MetaRow>(`SELECT backfill_complete, last_object_type,
      last_object_id FROM sync_identity_index_meta WHERE singleton_id = 1`);
    if (!meta) throw new Error('sync_identity_index_meta_missing');
    if (meta.backfill_complete === 1) return { complete: true, processed: 0 };
    const after = meta.last_object_type === null ? null : {
      object_type: meta.last_object_type, object_id: meta.last_object_id ?? ''
    };
    const rows = await statePage(tx, after, pageSize(limit));
    for (const row of rows) await updateIndexKey(tx, row, row.object_type, row.object_id, eligible);
    const last = rows.at(-1);
    await tx.run(`UPDATE sync_identity_index_meta SET backfill_complete = ?,
      last_object_type = ?, last_object_id = ? WHERE singleton_id = 1`,
    [rows.length < pageSize(limit) ? 1 : 0,
      last?.object_type ?? meta.last_object_type, last?.object_id ?? meta.last_object_id]);
    return { complete: rows.length < pageSize(limit), processed: rows.length };
  });
}

export async function drainSyncIdentityDirtyPage(port: DbPort, eligible: SyncIdentityEligibility,
  limit = 128) {
  return port.transaction(async (tx) => {
    const [meta] = await tx.query<MetaRow>(`SELECT backfill_complete, last_object_type,
      last_object_id FROM sync_identity_index_meta WHERE singleton_id = 1`);
    if (meta?.backfill_complete !== 1) throw new Error('sync_identity_backfill_pending');
    const keys = await tx.query<{ object_type: string; object_id: string } & DbRow>(
      `SELECT object_type, object_id FROM sync_identity_dirty_keys
       ORDER BY object_type, object_id LIMIT ?`, [pageSize(limit)]);
    for (const key of keys) {
      const [state] = await tx.query<StateRow>(`SELECT object_type, object_id, current_version_id,
        content_hash, updated_at, deleted_at FROM sync_object_state
        WHERE object_type = ? AND object_id = ?`, [key.object_type, key.object_id]);
      await updateIndexKey(tx, state ?? null, key.object_type, key.object_id, eligible);
      await tx.run(`DELETE FROM sync_identity_dirty_keys WHERE object_type = ? AND object_id = ?`,
        [key.object_type, key.object_id]);
    }
    return keys.length;
  });
}

export async function refreshSyncIdentityDigest(port: DbPort, limit = 128) {
  return port.transaction(async (tx) => {
    const [dirty] = await tx.query<{ count: number } & DbRow>(
      'SELECT COUNT(*) AS count FROM sync_identity_dirty_keys');
    const [meta] = await tx.query<MetaRow>(`SELECT backfill_complete, last_object_type,
      last_object_id FROM sync_identity_index_meta WHERE singleton_id = 1`);
    if (meta?.backfill_complete !== 1 || dirty?.count !== 0) {
      throw new Error('sync_identity_index_not_quiescent');
    }
    const [next] = await tx.query<{ partition: number } & DbRow>(`WITH RECURSIVE
      slots(partition) AS (SELECT 0 UNION ALL SELECT partition + 1 FROM slots WHERE partition < 255)
      SELECT slots.partition FROM slots LEFT JOIN sync_identity_partition_digest stored
        ON stored.partition = slots.partition WHERE stored.digest IS NULL
      ORDER BY slots.partition LIMIT 1`);
    if (!next) return false;
    const digest = createSyncIdentityDigest();
    let after: { object_type: string; object_id: string } | null = null;
    let count = 0;
    for (;;) {
      const where: string = after ? `AND (object_type > ? OR (object_type = ? AND object_id > ?))` : '';
      const params: DbParams = after ? [next.partition, after.object_type, after.object_type,
        after.object_id, pageSize(limit)] : [next.partition, pageSize(limit)];
      const rows: IndexRow[] = await tx.query<IndexRow>(`SELECT object_type, object_id, fingerprint
        FROM sync_identity_index_rows WHERE partition = ? ${where}
        ORDER BY object_type, object_id LIMIT ?`, params);
      for (const row of rows) digest.add(row);
      count += rows.length;
      if (rows.length < pageSize(limit)) break;
      after = rows.at(-1)!;
    }
    await tx.run(`INSERT INTO sync_identity_partition_digest (partition, digest, row_count)
      VALUES (?, ?, ?) ON CONFLICT(partition) DO UPDATE SET digest = excluded.digest,
      row_count = excluded.row_count`, [next.partition, digest.finish(), count]);
    return true;
  });
}

function readSchema(schema: string) {
  if (!/^[a-z][a-z0-9_]*$/u.test(schema)) throw new Error('sync_identity_schema_invalid');
  return schema;
}

export async function assertReadySyncIdentityIndex(port: DbPort, schema = 'main') {
  const source = readSchema(schema);
  const [state] = await port.query<{ complete: number; dirty: number; digests: number } & DbRow>(
      `SELECT (SELECT backfill_complete FROM ${source}.sync_identity_index_meta WHERE singleton_id = 1)
       AS complete, (SELECT COUNT(*) FROM ${source}.sync_identity_dirty_keys) AS dirty,
       (SELECT COUNT(*) FROM ${source}.sync_identity_partition_digest WHERE digest IS NOT NULL) AS digests`);
  if (state?.complete !== 1 || state.dirty !== 0) {
    throw new Error('sync_identity_index_not_ready');
  }
}

export async function readReadySyncIdentitySummary(port: DbPort, schema = 'main') {
  return port.transaction(async (tx) => {
    await assertReadySyncIdentityIndex(tx, schema);
    const digests = Array.from({ length: 256 }, () => createSyncIdentityDigest());
    const counts = Array<number>(256).fill(0);
    let after: { partition: number; object_type: string; object_id: string } | null = null;
    for (;;) {
      const rows: IndexRow[] = await tx.query<IndexRow>(`SELECT partition, object_type, object_id,
        fingerprint FROM ${readSchema(schema)}.sync_identity_index_rows
        WHERE (partition, object_type, object_id) > (?, ?, ?)
        ORDER BY partition, object_type, object_id LIMIT 128`,
      [after?.partition ?? -1, after?.object_type ?? '', after?.object_id ?? '']);
      for (const row of rows) { digests[row.partition]!.add(row); counts[row.partition]! += 1; }
      if (rows.length < 128) break;
      after = rows.at(-1)!;
    }
    return digests.map((digest, partition) => ({ partition, digest: digest.finish(),
      row_count: counts[partition]! }));
  });
}

export async function readReadySyncIdentityWatermark(port: DbPort, schema = 'main') {
  return port.transaction(async (tx) => {
    await assertReadySyncIdentityIndex(tx, schema);
    const [row] = await tx.query<{ watermark: string } & DbRow>(
      `SELECT COALESCE(MAX(updated_at), '') AS watermark FROM ${readSchema(schema)}.sync_identity_index_rows`);
    return row?.watermark ?? '';
  });
}

/** Read consecutive pages from the same fixed source view. */
export async function readReadySyncIdentityPage(port: DbPort, partition: number,
  after: { object_type: string; object_id: string } | null, limit = 128, maxBytes = 65536,
  schema = 'main') {
  if (!Number.isInteger(partition) || partition < 0 || partition > 255) {
    throw new Error('sync_identity_partition_invalid');
  }
  const budget = Math.max(256, Math.min(65536, Math.trunc(maxBytes)));
  return port.transaction(async (tx) => {
    await assertReadySyncIdentityIndex(tx, schema);
    const where = after ? `AND (object_type > ? OR (object_type = ? AND object_id > ?))` : '';
    const params = after ? [partition, after.object_type, after.object_type,
      after.object_id, pageSize(limit) + 1] : [partition, pageSize(limit) + 1];
    const candidates = await tx.query<IndexPageRow>(`SELECT object_type, object_id,
      fingerprint, updated_at FROM ${readSchema(schema)}.sync_identity_index_rows WHERE partition = ? ${where}
      ORDER BY object_type, object_id LIMIT ?`, params);
    const entries: IndexPageRow[] = [];
    let bytes = 2;
    for (const row of candidates.slice(0, pageSize(limit))) {
      const size = new TextEncoder().encode(JSON.stringify(row)).length + 1;
      if (bytes + size > budget) {
        if (entries.length === 0) throw new Error('sync_identity_page_item_too_large');
        break;
      }
      entries.push(row);
      bytes += size;
    }
    return { entries, nextAfter: candidates.length > entries.length ?
      { object_type: entries.at(-1)!.object_type, object_id: entries.at(-1)!.object_id } : null };
  });
}
