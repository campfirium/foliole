import { hashText } from './syncNodeResolution.js';

export const SYNC_PACK_DEPENDENCY_INITIAL_DIGEST = hashText('foliole-sync-pack-dependencies-v1');
export const SYNC_PACK_DEPENDENCY_MAX_ROWS = 128;
export const SYNC_PACK_DEPENDENCY_MAX_BYTES = 2 * 1024 * 1024;
export const SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES = [
  'node', 'node_open_state', 'node_reading', 'node_review', 'parent_child_order'
] as const;
export type SyncPackNodeDependencyObjectType = typeof SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES[number];

export interface SyncPackDependencyScope {
  groupId: string;
  peerId: string;
  sourceViewId: string;
  objectType: SyncPackNodeDependencyObjectType;
  objectId: string;
}

export interface SyncPackDependencyTransfer extends SyncPackDependencyScope {
  nodeIds?: string[];
  sourceEpoch: string;
  fromStateSeq: number;
  objectStateSeq: number;
  frontierStateSeq: number;
  expectedRows: number;
  expectedDigest: string;
}

export interface SyncPackDependencyRow {
  table: 'node_sync_versions' | 'node_sync_version_parents' | 'review_log';
  key: { key: string; ordinal: number };
  json: string;
}

export interface SyncPackDependencyPage {
  transfer: SyncPackDependencyTransfer;
  afterRow: number;
  beforeDigest: string;
  afterDigest: string;
  rows: SyncPackDependencyRow[];
}

export function advanceSyncPackDependencyDigest(previous: string, row: SyncPackDependencyRow) {
  return hashText(JSON.stringify([previous, row.table, row.key.key, row.key.ordinal, row.json]));
}

export function dependencyScopeParams(scope: SyncPackDependencyScope) {
  return [scope.groupId, scope.peerId, scope.sourceViewId, scope.objectType, scope.objectId];
}

export const DEPENDENCY_SCOPE_SQL =
  'group_id = ? AND peer_id = ? AND source_view_id = ? AND object_type = ? AND object_id = ?';

export function parseSyncPackDependencyTransfers(value: unknown): SyncPackDependencyTransfer[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > SYNC_PACK_DEPENDENCY_MAX_ROWS) {
    throw new Error('sync_pack_dependency_transfer_invalid');
  }
  const scopes = new Set<string>();
  let sourceViewId: string | undefined;
  return value.map((item: unknown) => {
    const transfer = item as SyncPackDependencyTransfer | null;
    if (!transfer || typeof transfer !== 'object' ||
        ![transfer.groupId, transfer.peerId, transfer.sourceViewId, transfer.objectId,
          transfer.sourceEpoch].every((field) => typeof field === 'string' && field.trim()) ||
        !SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES.includes(transfer.objectType) ||
        ![transfer.fromStateSeq, transfer.objectStateSeq, transfer.frontierStateSeq, transfer.expectedRows]
          .every((field) => Number.isSafeInteger(field) && field >= 0) ||
        (transfer.expectedRows === 0 && transfer.expectedDigest !== SYNC_PACK_DEPENDENCY_INITIAL_DIGEST) ||
        transfer.objectStateSeq <= transfer.fromStateSeq ||
        transfer.frontierStateSeq < transfer.objectStateSeq ||
        (transfer.nodeIds !== undefined && (!Array.isArray(transfer.nodeIds) ||
          transfer.nodeIds.length < 1 || transfer.nodeIds.length > SYNC_PACK_DEPENDENCY_MAX_ROWS ||
          !transfer.nodeIds.includes(transfer.objectId) ||
          transfer.nodeIds.some((id) => typeof id !== 'string' || !id.trim()) ||
          new Set(transfer.nodeIds).size !== transfer.nodeIds.length)) ||
        !/^[a-f0-9]{64}$/u.test(transfer.expectedDigest)) {
      throw new Error('sync_pack_dependency_transfer_invalid');
    }
    const scope = JSON.stringify([transfer.objectType, transfer.objectId]);
    if (sourceViewId !== undefined && sourceViewId !== transfer.sourceViewId) {
      throw new Error('sync_pack_dependency_source_view_mismatch');
    }
    sourceViewId = transfer.sourceViewId;
    if (scopes.has(scope)) throw new Error('sync_pack_dependency_transfer_duplicate');
    scopes.add(scope);
    return transfer;
  });
}

export function validateSyncPackDependencyPage(page: SyncPackDependencyPage) {
  const transfer = page.transfer;
  if (![...dependencyScopeParams(transfer), transfer.sourceEpoch].every((value) =>
    typeof value === 'string' && value.trim()) || !SYNC_PACK_NODE_DEPENDENCY_OBJECT_TYPES.includes(transfer.objectType) ||
      ![transfer.fromStateSeq, transfer.objectStateSeq, transfer.frontierStateSeq,
        transfer.expectedRows, page.afterRow].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      transfer.objectStateSeq <= transfer.fromStateSeq || transfer.frontierStateSeq < transfer.objectStateSeq ||
      ![transfer.expectedDigest, page.beforeDigest, page.afterDigest].every((value) => /^[a-f0-9]{64}$/u.test(value)) ||
      page.rows.length === 0 || page.rows.length > SYNC_PACK_DEPENDENCY_MAX_ROWS ||
      page.afterRow + page.rows.length > transfer.expectedRows) {
    throw new Error('sync_pack_dependency_page_invalid');
  }
  let digest = page.beforeDigest;
  let bytes = 0;
  for (const row of page.rows) {
    bytes += new TextEncoder().encode(row.json).byteLength;
    if (bytes > SYNC_PACK_DEPENDENCY_MAX_BYTES) throw new Error('sync_pack_dependency_page_over_budget');
    const value = JSON.parse(row.json) as Record<string, unknown>;
    const key = row.table === 'review_log' ? value.op_id : value.version_id;
    if (!['node_sync_versions', 'node_sync_version_parents', 'review_log'].includes(row.table) ||
        typeof row.key.key !== 'string' || !row.key.key || !Number.isSafeInteger(row.key.ordinal) ||
        row.key.ordinal < (row.table === 'node_sync_version_parents' ? 0 : -1) ||
        (row.table === 'review_log' && transfer.objectType !== 'node_review') ||
        key !== row.key.key || (row.table === 'node_sync_version_parents'
          ? value.ordinal !== row.key.ordinal : row.key.ordinal !== -1) ||
        (row.table === 'node_sync_versions' &&
          !(transfer.nodeIds ?? [transfer.objectId]).includes(String(value.object_id))) ||
        (row.table === 'review_log' && value.node_id !== transfer.objectId)) {
      throw new Error('sync_pack_dependency_row_invalid');
    }
    digest = advanceSyncPackDependencyDigest(digest, row);
  }
  if (digest !== page.afterDigest) throw new Error('sync_pack_dependency_page_digest_mismatch');
}
