import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import { buildSyncIdentityCandidatePage,
  type SyncIdentityCandidatePageInput } from '../../../../../lib/core/sync/syncIdentityCandidatePage';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { withCompanionSyncIdentitySnapshot } from './syncGroupIdentitySourceRead';

export interface CompanionIdentityCandidateRow extends DbRow {
  object_type: string;
  object_id: string;
  partition: number;
  kind: 'source_only' | 'receiver_only' | 'divergent';
  source_fingerprint: string | null;
  receiver_fingerprint: string | null;
}

const TABLE = 'identity_view.sync_identity_candidates';
const CHANGED = 'identity_view.sync_identity_changed_keys';

export async function initializeCompanionIdentityCandidates(snapshotPath: string) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, async () => {
      await port.run(`CREATE TABLE ${TABLE} (
        object_type TEXT NOT NULL, object_id TEXT NOT NULL, partition INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('source_only', 'receiver_only', 'divergent')),
        source_fingerprint TEXT, receiver_fingerprint TEXT,
        PRIMARY KEY (object_type, object_id))`);
    })));
}

export async function stageCompanionIdentityCandidates(snapshotPath: string,
  rows: CompanionIdentityCandidateRow[]) {
  if (rows.length === 0) return;
  if (rows.length > 128) throw new Error('sync_identity_candidate_batch_invalid');
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, (db) => db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.run(`INSERT INTO ${TABLE} (object_type, object_id, partition, kind,
          source_fingerprint, receiver_fingerprint) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(object_type, object_id) DO NOTHING`,
        [row.object_type, row.object_id, row.partition, row.kind,
          row.source_fingerprint, row.receiver_fingerprint]);
      }
    }))));
}

export async function initializeCompanionIdentityChangedKeys(snapshotPath: string) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, async () => {
      await port.run(`CREATE TABLE ${CHANGED} (object_type TEXT NOT NULL, object_id TEXT NOT NULL,
        partition INTEGER NOT NULL, PRIMARY KEY (object_type, object_id))`);
    })));
}

export async function stageCompanionIdentityChangedKeys(snapshotPath: string,
  rows: Array<{ object_type: string; object_id: string; partition: number }>) {
  if (!rows.length) return;
  if (rows.length > 128) throw new Error('sync_identity_candidate_batch_invalid');
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, (db) => db.transaction(async (tx) => {
      for (const row of rows) await tx.run(`INSERT INTO ${CHANGED} VALUES (?, ?, ?)
        ON CONFLICT(object_type, object_id) DO NOTHING`,
      [row.object_type, row.object_id, row.partition]);
    }))));
}

export async function readCompanionIdentityChangedPartitions(snapshotPath: string) {
  return getIosCompanionDatabaseOwner().read((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, (db) =>
      db.query<{ partition: number }>(`SELECT DISTINCT partition FROM ${CHANGED}`)));
}

export async function stageCompanionIdentityChangedCandidates(snapshotPath: string,
  rows: CompanionIdentityCandidateRow[]) {
  if (!rows.length) return;
  if (rows.length > 128) throw new Error('sync_identity_candidate_batch_invalid');
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, (db) => db.transaction(async (tx) => {
      for (const row of rows) await tx.run(`INSERT INTO ${TABLE}
        (object_type, object_id, partition, kind, source_fingerprint, receiver_fingerprint)
        SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${CHANGED}
          WHERE object_type = ? AND object_id = ?)
        ON CONFLICT(object_type, object_id) DO NOTHING`,
      [row.object_type, row.object_id, row.partition, row.kind,
        row.source_fingerprint, row.receiver_fingerprint, row.object_type, row.object_id]);
    }))));
}

export async function countCompanionIdentityCandidates(snapshotPath: string) {
  return getIosCompanionDatabaseOwner().read((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, async () => {
      const [row] = await port.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${TABLE}`);
      return row?.count ?? 0;
    }));
}

export async function readCompanionIdentitySemanticCandidates(snapshotPath: string,
  after: string) {
  return getIosCompanionDatabaseOwner().read((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, (db) =>
      db.query<CompanionIdentityCandidateRow>(`SELECT object_type, object_id,
        partition, kind, source_fingerprint, receiver_fingerprint FROM ${TABLE}
        WHERE object_type = 'node' AND kind = 'divergent'
          AND source_fingerprint = receiver_fingerprint AND object_id > ?
        ORDER BY object_id LIMIT 128`, [after])));
}

export async function removeCompanionIdentitySatisfiedCandidates(snapshotPath: string,
  rows: CompanionIdentityCandidateRow[]) {
  if (!rows.length) return;
  if (rows.length > 128) throw new Error('sync_identity_candidate_batch_invalid');
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, (db) => db.transaction(async (tx) => {
      for (const row of rows) await tx.run(`DELETE FROM ${TABLE}
        WHERE object_type = 'node' AND object_id = ? AND kind = 'divergent'
          AND source_fingerprint = ? AND receiver_fingerprint = ?`,
      [row.object_id, row.source_fingerprint, row.receiver_fingerprint]);
    }))));
}

export async function readCompanionIdentityCandidatePage(args: SyncIdentityCandidatePageInput & {
  after: { object_type: string; object_id: string } | null;
  snapshotPath: string;
}) {
  if (!['source', 'receiver'].includes(args.direction) ||
      args.after && (!args.after.object_type || !args.after.object_id)) {
    throw new Error('sync_identity_candidate_page_invalid');
  }
  const column = args.direction === 'source' ? 'source_fingerprint' : 'receiver_fingerprint';
  const kind = args.direction === 'source' ? 'source_only' : 'receiver_only';
  return getIosCompanionDatabaseOwner().read((port: DbPort) =>
    withCompanionSyncIdentitySnapshot(port, args.snapshotPath, async () => {
      const rows = await port.query<{ object_type: string; object_id: string; fingerprint: string }>(
        `SELECT object_type, object_id, ${column} AS fingerprint FROM ${TABLE}
         WHERE kind IN (?, 'divergent') AND
           (object_type > ? OR (object_type = ? AND object_id > ?))
         ORDER BY object_type, object_id LIMIT ?`,
        [kind, args.after?.object_type ?? '', args.after?.object_type ?? '',
          args.after?.object_id ?? '', (args.limit ?? 128) + 1]);
      return buildSyncIdentityCandidatePage(args, rows);
    }));
}
