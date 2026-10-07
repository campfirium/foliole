import type { DbPort, DbRow } from './dbPort.js';
import type { FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { loadSyncNodeVersionAncestors, loadSyncNodeVersionParents } from './syncNodeLineage.js';
import { loadVerifiedBodyRef, type VerifiedBodyRef } from './verifiedBody.js';

export interface StoredVerifiedVersionRow extends DbRow {
  body_state: 'readable' | 'retired' | 'unavailable';
  body_blob_hash: string | null;
  content_hash: string;
  created_at: string;
  host_name: string;
  object_id: string;
  snapshot_json: string;
  version_id: string;
  is_tombstone?: number;
}

export type StoredVerifiedSyncNode = Omit<VerifiedFramedSyncNode, 'body'> & {
  body: VerifiedFramedSyncNode['body'] | Readonly<{ kind: 'unavailable'; hash: string | null }>;
};

/** Requires the formal body schema; no continuous-body fallback or feature detection. */
export async function loadVerifiedSyncNodeVersion(db: DbPort, versionId: string,
  includeAncestors = true): Promise<StoredVerifiedSyncNode | null> {
  const [row] = await db.query<StoredVerifiedVersionRow>(`SELECT version_id, object_id, host_name, created_at,
    content_hash, body_state, body_blob_hash, json_remove(snapshot_json, '$.content') AS snapshot_json
    FROM node_sync_versions WHERE version_id = ?`, [versionId]);
  if (!row) return null;
  return storedVerifiedVersionToNode(db, row, includeAncestors);
}

export async function storedVerifiedVersionToNode(db: DbPort, row: StoredVerifiedVersionRow,
  includeAncestors: boolean, knownParents?: readonly string[]): Promise<StoredVerifiedSyncNode> {
  const snapshot = JSON.parse(row.snapshot_json) as FramedSyncNodeMetadata['snapshot'];
  const parents = knownParents ? [...knownParents] : await loadSyncNodeVersionParents(db, row.version_id);
  const body = await loadStoredBody(db, row);
  const alternativeBodies: VerifiedBodyRef[] = [];
  if (body.kind === 'readable') {
    for (const entry of snapshot.text_alternatives ?? []) {
      const ref = await loadVerifiedBodyRef(db, entry.body_blob_hash);
      if (!ref) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
      alternativeBodies.push(ref);
    }
  }
  return { body, alternativeBodies, metadata: {
    ancestor_version_ids: includeAncestors ? await loadSyncNodeVersionAncestors(db, row.version_id) : [],
    content_hash: row.content_hash, host_name: row.host_name, is_tombstone: row.is_tombstone === 1,
    object_id: row.object_id, object_type: 'node', parent_version_id: parents[0] ?? null,
    parent_version_ids: parents, snapshot, updated_at: snapshot.updated_at,
    version_created_at: row.created_at, version_id: row.version_id
  } };
}

export async function loadCurrentVerifiedSyncNode(db: DbPort, objectId: string): Promise<VerifiedFramedSyncNode | null> {
  const [row] = await db.query<{ current_version_id: string | null }>(
    'SELECT current_version_id FROM nodes WHERE id = ?', [objectId]);
  if (!row?.current_version_id) return null;
  const record = await loadVerifiedSyncNodeVersion(db, row.current_version_id);
  if (!record) return null;
  if (record.body.kind !== 'readable') throw new Error(`sync_node_version_body_unavailable:${row.current_version_id}`);
  return { ...record, body: record.body };
}

async function loadStoredBody(db: DbPort, row: StoredVerifiedVersionRow): Promise<StoredVerifiedSyncNode['body']> {
  if (row.body_state === 'retired') return { kind: 'retired' };
  if (row.body_state === 'unavailable') return { kind: 'unavailable', hash: row.body_blob_hash };
  if (row.body_state !== 'readable' || !row.body_blob_hash) throw new Error('sync_node_version_body_state_invalid');
  const ref = await loadVerifiedBodyRef(db, row.body_blob_hash);
  return ref ? { kind: 'readable', ref } : { kind: 'unavailable', hash: row.body_blob_hash };
}
