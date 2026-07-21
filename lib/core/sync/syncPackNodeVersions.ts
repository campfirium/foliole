import type { DbRow } from './dbPort.js';

export const SYNC_PACK_NODE_VERSION_COLUMNS = [
  'version_id',
  'object_id',
  'parent_version_id',
  'device_id',
  'created_at',
  'content_hash',
  'snapshot_json'
] as const;

export interface SyncPackNodeVersionRow extends DbRow {
  content_hash: string;
  created_at: string;
  device_id: string;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

export function assertValidNodeVersionSnapshot(row: SyncPackNodeVersionRow) {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(row.snapshot_json);
  } catch {
    throw new Error(`sync_pack_node_version_snapshot_invalid:${row.version_id}`);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error(`sync_pack_node_version_snapshot_invalid:${row.version_id}`);
  }
}
