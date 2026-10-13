import type { DbRow } from './dbPort.js';

export const SYNC_NODE_VERSION_COLUMNS = [
  'version_id',
  'object_id',
  'parent_version_id',
  'host_name',
  'created_at',
  'content_hash',
  'body_text',
  'snapshot_json'
] as const;

export interface SyncNodeVersionRow extends DbRow {
  content_hash: string;
  body_text: string | null;
  created_at: string;
  host_name: string;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

export interface SyncNodeVersionParentRow extends DbRow {
  ordinal: number;
  parent_version_id: string;
  version_id: string;
}

export function assertValidNodeVersionSnapshot(row: SyncNodeVersionRow) {
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
