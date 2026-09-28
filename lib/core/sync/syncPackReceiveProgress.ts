import type { DbPort } from './dbPort.js';
import { assertContiguousSyncPackCursor, type SyncPackCursor } from './syncPackCursor.js';

export interface SyncPackReceiveProgress {
  completed: boolean;
  cursorStateSeq: number;
  frontierStateSeq: number;
  groupId: string;
  peerId: string;
  restoreId: string | null;
  sourceEpoch: string;
}

interface ProgressRow {
  [key: string]: unknown;
  completed: number;
  cursor_state_seq: number;
  frontier_state_seq: number;
  restore_id: string | null;
  source_epoch: string;
}

export async function loadSyncPackReceiveProgress(port: DbPort, peerId: string) {
  const [group] = await port.query<{ group_id: string }>(
    "SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'"
  );
  if (!group?.group_id) throw new Error('sync_group_not_available');
  const [row] = await port.query<ProgressRow>(
    `SELECT source_epoch, cursor_state_seq, frontier_state_seq, restore_id, completed
     FROM sync_pack_receive_progress WHERE group_id = ? AND peer_id = ?`,
    [group.group_id, peerId]
  );
  return { groupId: group.group_id, progress: row ? {
    completed: row.completed === 1,
    cursorStateSeq: row.cursor_state_seq,
    frontierStateSeq: row.frontier_state_seq,
    groupId: group.group_id,
    peerId,
    restoreId: row.restore_id,
    sourceEpoch: row.source_epoch
  } satisfies SyncPackReceiveProgress : null };
}

export function shouldApplySyncPackPage(
  cursor: SyncPackCursor,
  progress: SyncPackReceiveProgress | null,
  currentCursor: number,
  retired: boolean
) {
  if (retired) throw new Error('sync_pack_source_epoch_retired');
  if (!progress) {
    if (currentCursor > 0) throw new Error('sync_pack_source_epoch_unproven');
    if (cursor.fromStateSeq === 0 && cursor.toStateSeq === 0 &&
        cursor.frontierStateSeq === 0) return true;
    return assertContiguousSyncPackCursor(cursor, currentCursor);
  }
  if (progress?.sourceEpoch !== cursor.sourceEpoch) {
    if (cursor.fromStateSeq !== 0) throw new Error('sync_pack_source_epoch_changed');
    return cursor.toStateSeq > 0 || cursor.frontierStateSeq === 0;
  }
  const leavingCompletedRestore = progress.completed && progress.restoreId !== null &&
    cursor.restoreId === undefined;
  if (progress.restoreId !== (cursor.restoreId ?? null) && !leavingCompletedRestore) {
    throw new Error('sync_pack_restore_event_changed');
  }
  if (!progress.completed && progress.frontierStateSeq !== cursor.frontierStateSeq) {
    throw new Error('sync_pack_frontier_changed');
  }
  if (cursor.toStateSeq <= progress.cursorStateSeq) return false;
  if (cursor.fromStateSeq !== progress.cursorStateSeq) {
    throw new Error('sync_pack_cursor_not_contiguous');
  }
  return true;
}

export async function isRetiredSyncPackSourceEpoch(port: DbPort, groupId: string,
  peerId: string, sourceEpoch: string) {
  const rows = await port.query<{ source_epoch: string }>(
    `SELECT source_epoch FROM sync_pack_retired_source_epochs
     WHERE group_id = ? AND peer_id = ? AND source_epoch = ?`,
    [groupId, peerId, sourceEpoch]
  );
  return rows.length > 0;
}

export async function saveSyncPackReceiveProgress(
  port: DbPort,
  groupId: string,
  peerId: string,
  cursor: SyncPackCursor
) {
  const [previous] = await port.query<{ source_epoch: string }>(
    'SELECT source_epoch FROM sync_pack_receive_progress WHERE group_id = ? AND peer_id = ?',
    [groupId, peerId]
  );
  if (previous && previous.source_epoch !== cursor.sourceEpoch) {
    await port.run(`INSERT OR IGNORE INTO sync_pack_retired_source_epochs
      (group_id, peer_id, source_epoch, retired_at) VALUES (?, ?, ?, ?)`,
    [groupId, peerId, previous.source_epoch, new Date().toISOString()]);
  }
  await port.run(
    `INSERT INTO sync_pack_receive_progress
     (group_id, peer_id, source_epoch, cursor_state_seq, frontier_state_seq,
      restore_id, completed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id, peer_id) DO UPDATE SET
       source_epoch = excluded.source_epoch, cursor_state_seq = excluded.cursor_state_seq,
       frontier_state_seq = excluded.frontier_state_seq, restore_id = excluded.restore_id,
       completed = excluded.completed, updated_at = excluded.updated_at`,
    [groupId, peerId, cursor.sourceEpoch, cursor.toStateSeq, cursor.frontierStateSeq,
      cursor.restoreId ?? null, cursor.toStateSeq === cursor.frontierStateSeq ? 1 : 0,
      new Date().toISOString()]
  );
}
