import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { decideIncomingNodeApply, type LocalSyncNodeState, type SyncNodeApplyOperation } from './syncNodeApplyRules.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import { sameSharedSnapshot } from './syncNodeLineageEquivalence.js';

export async function decideVerifiedNodeApply(db: DbPort, local: LocalSyncNodeState | null,
  record: VerifiedFramedSyncNode, operation?: SyncNodeApplyOperation) {
  const meta = record.metadata;
  if (local?.sync_dirty === 0 && local.current_version_id && meta.version_id &&
      meta.version_id !== local.current_version_id &&
      await isStoredAncestorVersion(db, meta.version_id, local.current_version_id)) return 'skip_stale';
  const decision = decideIncomingNodeApply(local, meta, operation);
  if (decision !== 'record_conflict' || local?.sync_dirty !== 0) return decision;
  if (local.current_version_id && meta.version_id &&
      await isStoredAncestorVersion(db, local.current_version_id, meta.version_id)) return 'apply_fast_forward';
  if (!await equivalentIncomingLineage(db, local.current_version_id, record)) return decision;
  return (meta.version_id ?? '').localeCompare(local.current_version_id ?? '') > 0 ? 'apply_fast_forward' : 'skip_stale';
}

async function equivalentIncomingLineage(db: DbPort, versionId: string | null, record: VerifiedFramedSyncNode) {
  if (!versionId) return false;
  const [local] = await db.query<{ content_hash: string; body_state: string; body_blob_hash: string | null; snapshot_json: string }>(
    `SELECT content_hash, body_state, body_blob_hash, json_remove(snapshot_json, '$.content') AS snapshot_json
      FROM node_sync_versions WHERE version_id = ? AND object_id = ? LIMIT 1`, [versionId, record.metadata.object_id]);
  if (!local) return false;
  const lineage = new Set([record.metadata.version_id, ...record.metadata.ancestor_version_ids]);
  const matches = await db.query<{ version_id: string }>(
    'SELECT version_id FROM node_sync_versions WHERE object_id = ? AND content_hash = ?',
    [record.metadata.object_id, local.content_hash]);
  if (matches.some((entry) => lineage.has(entry.version_id))) return true;
  return record.body.kind === 'readable' && local.body_state === 'readable' &&
    local.body_blob_hash === record.body.ref.hash && sameSharedSnapshot(JSON.parse(local.snapshot_json), record.metadata.snapshot);
}
