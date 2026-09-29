import type { DbPort } from './dbPort.js';
import type { SyncPackCursor } from './syncPackCursor.js';
import { readDependencyTail } from './syncPackDependencyResume.js';
import { stageSyncPackDependencyPage } from './syncPackDependencyStaging.js';
import { SYNC_PACK_DEPENDENCY_MAX_BYTES, type SyncPackDependencyRow } from './syncPackDependencyTransfer.js';
import { isRetiredSyncPackSourceEpoch, loadSyncPackReceiveProgress, shouldApplySyncPackPage } from './syncPackReceiveProgress.js';

export const SYNC_PACK_DEPENDENCY_PAGE_SCHEMA = `CREATE TABLE sync_pack_dependency_page_rows (
  row_index INTEGER PRIMARY KEY, row_json TEXT NOT NULL
)`;

export async function stageSyncPackDependencySurface(port: DbPort, args: {
  cursor: SyncPackCursor; currentCursor: number; sourcePeerId?: string; incomingAlias?: string;
}) {
  if (!args.sourcePeerId) throw new Error('sync_pack_dependency_apply_scope_missing');
  const dependencyProgress = await applySyncPackDependencyPageFromDatabase(port, {
    ...args, sourcePeerId: args.sourcePeerId, incomingAlias: args.incomingAlias ?? 'inc'
  });
  return { dependencyProgress, applied: false, frontierStateSeq: args.cursor.frontierStateSeq,
    sourceEpoch: args.cursor.sourceEpoch, fromStateSeq: args.cursor.fromStateSeq,
    toStateSeq: args.cursor.fromStateSeq, appliedTombstoneNodeIds: [] as string[],
    participatingArticleIds: [] as string[], appliedBlobCount: 0, appliedGroupFactCount: 0,
    appliedObjectCount: 0, appliedReviewOpIds: [] as string[], handledConflictCount: 0 };
}

/** Stage an authenticated SQLite dependency page without publishing business state. */
export async function applySyncPackDependencyPageFromDatabase(port: DbPort, args: {
  cursor: SyncPackCursor; currentCursor: number; sourcePeerId: string; incomingAlias: string;
}) {
  const { cursor } = args;
  const header = cursor.dependencyPage;
  if (!header || cursor.toStateSeq !== cursor.fromStateSeq ||
      cursor.fromStateSeq !== args.currentCursor ||
      header.transfer.fromStateSeq !== cursor.fromStateSeq ||
      header.transfer.sourceEpoch !== cursor.sourceEpoch ||
      header.transfer.frontierStateSeq !== cursor.frontierStateSeq ||
      header.transfer.peerId !== args.sourcePeerId) {
    throw new Error('sync_pack_dependency_page_scope_mismatch');
  }
  const alias = `"${args.incomingAlias.replaceAll('"', '""')}"`;
  return port.transaction(async (tx) => {
    const scope = await loadSyncPackReceiveProgress(tx, args.sourcePeerId);
    if (!scope || scope.groupId !== header.transfer.groupId) {
      throw new Error('sync_pack_dependency_page_scope_mismatch');
    }
    const retired = await isRetiredSyncPackSourceEpoch(tx, scope.groupId, args.sourcePeerId, cursor.sourceEpoch);
    if (!shouldApplySyncPackPage({ ...cursor, toStateSeq: header.transfer.objectStateSeq },
      scope.progress, args.currentCursor, retired)) throw new Error('sync_pack_dependency_already_applied');
    const [size] = await tx.query<{ count: number; bytes: number }>(
      `SELECT count(*) AS count, coalesce(sum(length(CAST(row_json AS BLOB))), 0) AS bytes
       FROM ${alias}.sync_pack_dependency_page_rows`);
    if (size?.count !== header.rowCount || size.bytes > SYNC_PACK_DEPENDENCY_MAX_BYTES + 128 * 1024) {
      throw new Error('sync_pack_dependency_page_over_budget');
    }
    const stored = await tx.query<{ row_index: number; row_json: string }>(
      `SELECT row_index, row_json FROM ${alias}.sync_pack_dependency_page_rows ORDER BY row_index`);
    if (stored.some((row, index) => row.row_index !== header.afterRow + index)) {
      throw new Error('sync_pack_dependency_page_not_contiguous');
    }
    const rows = stored.map((row) => JSON.parse(row.row_json) as SyncPackDependencyRow);
    const result = await stageSyncPackDependencyPage(tx, { ...header, rows });
    return { ...result, ...await readDependencyTail(tx, header.transfer, result.nextRow) };
  });
}
