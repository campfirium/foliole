import type { DbPort, DbRow } from './dbPort.js';
import {
  advanceSyncPackDependencyDigest, DEPENDENCY_SCOPE_SQL, dependencyScopeParams,
  SYNC_PACK_DEPENDENCY_INITIAL_DIGEST, validateSyncPackDependencyPage,
  type SyncPackDependencyPage, type SyncPackDependencyTransfer
} from './syncPackDependencyTransfer.js';

interface TransferRow extends DbRow {
  source_epoch: string;
  from_state_seq: number;
  object_state_seq: number;
  frontier_state_seq: number;
  expected_rows: number;
  expected_digest: string;
  next_row: number;
  received_digest: string;
  completed: number;
}

export async function stageSyncPackDependencyPage(port: DbPort, page: SyncPackDependencyPage) {
  validateSyncPackDependencyPage(page);
  return port.transaction(async (tx) => {
    const [retired] = await tx.query(`SELECT 1 FROM sync_pack_retired_source_views
      WHERE group_id = ? AND peer_id = ? AND source_view_id = ?`,
    [page.transfer.groupId, page.transfer.peerId, page.transfer.sourceViewId]);
    if (retired) throw new Error('sync_pack_dependency_source_view_retired');
    const progress = await loadOrStartTransfer(tx, page);
    const end = page.afterRow + page.rows.length;
    if (page.afterRow > progress.next_row || (page.afterRow < progress.next_row && end > progress.next_row)) {
      throw new Error('sync_pack_dependency_page_not_contiguous');
    }
    if (page.afterRow < progress.next_row) {
      await assertRepeatedPage(tx, page);
      return { nextRow: progress.next_row, completed: progress.completed === 1, replay: true };
    }
    if (page.beforeDigest !== progress.received_digest) {
      throw new Error('sync_pack_dependency_prefix_changed');
    }
    await insertPage(tx, page);
    const completed = end === page.transfer.expectedRows;
    if (completed && page.afterDigest !== page.transfer.expectedDigest) {
      throw new Error('sync_pack_dependency_object_digest_mismatch');
    }
    await tx.run(`UPDATE sync_pack_dependency_transfers
      SET next_row = ?, received_digest = ?, completed = ? WHERE ${DEPENDENCY_SCOPE_SQL}`,
    [end, page.afterDigest, completed ? 1 : 0, ...dependencyScopeParams(page.transfer)]);
    return { nextRow: end, completed, replay: false };
  });
}

async function loadOrStartTransfer(port: DbPort, page: SyncPackDependencyPage) {
  const scope = dependencyScopeParams(page.transfer);
  let [progress] = await port.query<TransferRow>(
    `SELECT * FROM sync_pack_dependency_transfers WHERE ${DEPENDENCY_SCOPE_SQL}`, scope);
  if (!progress) {
    if (page.afterRow !== 0 || page.beforeDigest !== SYNC_PACK_DEPENDENCY_INITIAL_DIGEST) {
      throw new Error('sync_pack_dependency_page_not_contiguous');
    }
    const transfer = page.transfer;
    await port.run(`INSERT INTO sync_pack_dependency_transfers
      (group_id, peer_id, source_view_id, object_type, object_id, source_epoch,
       from_state_seq, object_state_seq, frontier_state_seq, expected_rows, expected_digest,
       next_row, received_digest, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)`,
    [...scope, transfer.sourceEpoch, transfer.fromStateSeq, transfer.objectStateSeq,
      transfer.frontierStateSeq, transfer.expectedRows, transfer.expectedDigest, page.beforeDigest]);
    [progress] = await port.query<TransferRow>(
      `SELECT * FROM sync_pack_dependency_transfers WHERE ${DEPENDENCY_SCOPE_SQL}`, scope);
  }
  if (!progress || !sameTransfer(progress, page.transfer)) {
    throw new Error('sync_pack_dependency_transfer_changed');
  }
  return progress;
}

function sameTransfer(row: TransferRow, transfer: SyncPackDependencyTransfer) {
  return row.source_epoch === transfer.sourceEpoch && row.from_state_seq === transfer.fromStateSeq &&
    row.object_state_seq === transfer.objectStateSeq && row.frontier_state_seq === transfer.frontierStateSeq &&
    row.expected_rows === transfer.expectedRows && row.expected_digest === transfer.expectedDigest;
}

async function insertPage(port: DbPort, page: SyncPackDependencyPage) {
  let digest = page.beforeDigest;
  for (const [index, row] of page.rows.entries()) {
    digest = advanceSyncPackDependencyDigest(digest, row);
    await port.run(`INSERT INTO sync_pack_dependency_rows
      (group_id, peer_id, source_view_id, object_type, object_id, row_index,
       table_name, key_json, payload_json, digest_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...dependencyScopeParams(page.transfer), page.afterRow + index,
      row.table, JSON.stringify(row.key), row.json, digest]);
  }
}

async function assertRepeatedPage(port: DbPort, page: SyncPackDependencyPage) {
  const scope = dependencyScopeParams(page.transfer);
  const previous = page.afterRow === 0 ? SYNC_PACK_DEPENDENCY_INITIAL_DIGEST :
    (await port.query<{ digest_after: string }>(`SELECT digest_after FROM sync_pack_dependency_rows
      WHERE ${DEPENDENCY_SCOPE_SQL} AND row_index = ?`, [...scope, page.afterRow - 1]))[0]?.digest_after;
  if (previous !== page.beforeDigest) throw new Error('sync_pack_dependency_prefix_changed');
  const held = await port.query<{ table_name: string; key_json: string; payload_json: string }>(
    `SELECT table_name, key_json, payload_json FROM sync_pack_dependency_rows
     WHERE ${DEPENDENCY_SCOPE_SQL} AND row_index >= ? AND row_index < ? ORDER BY row_index`,
    [...scope, page.afterRow, page.afterRow + page.rows.length]);
  if (held.length !== page.rows.length || held.some((row, index) =>
    row.table_name !== page.rows[index]!.table || row.key_json !== JSON.stringify(page.rows[index]!.key) ||
    row.payload_json !== page.rows[index]!.json)) {
    throw new Error('sync_pack_dependency_replay_changed');
  }
}
