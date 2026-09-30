import type { DbPort } from './dbPort.js';
import { dependencyScopeParams, DEPENDENCY_SCOPE_SQL, type SyncPackDependencyTransfer } from './syncPackDependencyTransfer.js';
import { clearSyncPackKnownFactClaims } from './syncPackKnownFactClaims.js';

export async function retireSyncPackDependencyView(port: DbPort, transfer: Pick<SyncPackDependencyTransfer, 'groupId' | 'peerId' | 'sourceViewId'>) {
  await port.transaction(async (tx) => {
    const scope = [transfer.groupId, transfer.peerId, transfer.sourceViewId];
    await tx.run(`INSERT OR IGNORE INTO sync_pack_retired_source_views
      (group_id, peer_id, source_view_id, retired_at) VALUES (?, ?, ?, ?)`,
    [...scope, new Date().toISOString()]);
    for (const table of ['sync_pack_dependency_rows', 'sync_pack_dependency_transfers']) {
      await tx.run(`DELETE FROM ${table} WHERE group_id = ? AND peer_id = ? AND source_view_id = ?`, scope);
    }
    await clearSyncPackKnownFactClaims(tx, { groupId: transfer.groupId, peerId: transfer.peerId,
      sourceViewId: transfer.sourceViewId });
  });
}

/** A committed cursor makes earlier unfinished views impossible to complete. */
export async function retireObsoleteSyncPackDependencyViews(port: DbPort, args: {
  groupId: string; peerId: string; currentCursor: number;
}) {
  await port.transaction(async (tx) => {
    const views = await tx.query<{ source_view_id: string }>(
      `SELECT source_view_id FROM sync_pack_dependency_transfers
       WHERE group_id = ? AND peer_id = ? AND from_state_seq < ?
       UNION SELECT source_view_id FROM sync_pack_known_fact_claims
       WHERE group_id = ? AND peer_id = ? AND kind = 'progress' AND fact_key = 'round'
         AND json_extract(fact_json, '$.from_state_seq') < ?`,
      [args.groupId, args.peerId, args.currentCursor,
        args.groupId, args.peerId, args.currentCursor]);
    for (const view of views) {
      const scope = [args.groupId, args.peerId, view.source_view_id];
      await tx.run(`INSERT OR IGNORE INTO sync_pack_retired_source_views
        (group_id, peer_id, source_view_id, retired_at) VALUES (?, ?, ?, ?)`,
      [...scope, new Date().toISOString()]);
      for (const table of ['sync_pack_dependency_rows', 'sync_pack_dependency_transfers']) {
        await tx.run(`DELETE FROM ${table}
          WHERE group_id = ? AND peer_id = ? AND source_view_id = ?`, scope);
      }
      await clearSyncPackKnownFactClaims(tx, { groupId: args.groupId,
        peerId: args.peerId, sourceViewId: view.source_view_id });
    }
  });
}

export async function readDependencyTail(port: DbPort, transfer: SyncPackDependencyTransfer, nextRow: number) {
  const [tail] = await port.query<{ digest_after: string; table_name: string; key_json: string }>(
    `SELECT digest_after, table_name, key_json FROM sync_pack_dependency_rows
     WHERE ${DEPENDENCY_SCOPE_SQL} AND row_index = ?`, [...dependencyScopeParams(transfer), nextRow - 1]);
  if (!tail) throw new Error('sync_pack_dependency_resume_missing');
  return { transfer, nextRow, digest: tail.digest_after,
    position: { table: tail.table_name, key: JSON.parse(tail.key_json) as { key: string; ordinal: number } } };
}

export async function loadSyncPackDependencyResume(port: DbPort, args: {
  groupId: string; peerId: string; fromStateSeq: number;
}) {
  const [row] = await port.query<{ source_view_id: string; source_epoch: string; object_type: 'node' | 'node_review';
    object_id: string; object_state_seq: number; frontier_state_seq: number;
    expected_rows: number; expected_digest: string; next_row: number }>(
    `SELECT * FROM sync_pack_dependency_transfers
     WHERE group_id = ? AND peer_id = ? AND from_state_seq = ? AND next_row > 0
     ORDER BY rowid DESC LIMIT 1`, [args.groupId, args.peerId, args.fromStateSeq]);
  if (!row) return null;
  return readDependencyTail(port, { ...args, sourceViewId: row.source_view_id, sourceEpoch: row.source_epoch,
    objectType: row.object_type, objectId: row.object_id, objectStateSeq: row.object_state_seq,
    frontierStateSeq: row.frontier_state_seq, expectedRows: row.expected_rows, expectedDigest: row.expected_digest }, row.next_row);
}

export function dependencyResumeUrl(url: string, resume: Awaited<ReturnType<typeof readDependencyTail>>) {
  const next = new URL(url);
  next.searchParams.delete('fact_view');
  next.searchParams.set('dependency_view', resume.transfer.sourceViewId);
  next.searchParams.set('dependency_object_type', resume.transfer.objectType);
  next.searchParams.set('dependency_object_id', resume.transfer.objectId);
  next.searchParams.set('source_epoch', resume.transfer.sourceEpoch);
  next.searchParams.set('frontier_state_seq', String(resume.transfer.frontierStateSeq));
  next.searchParams.set('dependency_after_row', String(resume.nextRow));
  next.searchParams.set('dependency_digest', resume.digest);
  next.searchParams.set('dependency_table', resume.position.table);
  next.searchParams.set('dependency_key', resume.position.key.key);
  next.searchParams.set('dependency_ordinal', String(resume.position.key.ordinal));
  return next.toString();
}
