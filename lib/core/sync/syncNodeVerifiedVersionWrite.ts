import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';

import { adoptVerifiedBody } from './bodyContentWrite.js';
import type { DbPort, DbRow } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { hasCompleteVerifiedTombstoneVersion } from './syncNodeBodyPayloadHash.js';
import { includeLegacyVersionParents, validateStoredVersionDependencies } from './syncPackNodeVersionDependencyValidation.js';
import { loadVerifiedBodyRef } from './verifiedBody.js';

interface StoredIdentity extends DbRow {
  body_state: string;
  body_blob_hash: string | null;
  content_hash: string;
  created_at: string;
  host_name: string;
  object_id: string;
}

/** The durable version becomes the owner in this transaction; no text or continuous byte row is written. */
export async function upsertVerifiedSyncNodeVersion(db: DbPort, record: VerifiedFramedSyncNode) {
  const { metadata } = record;
  if (!metadata.version_id || !metadata.host_name || !metadata.version_created_at) return 'incomplete' as const;
  const completeTombstone = metadata.is_tombstone && await hasCompleteVerifiedTombstoneVersion(db, record);
  if (metadata.is_tombstone && !completeTombstone) return 'incomplete' as const;
  return db.transaction(async (tx) => {
    const [existing] = await tx.query<StoredIdentity>(`SELECT object_id, content_hash, host_name, created_at,
      body_state, body_blob_hash FROM node_sync_versions WHERE version_id = ?`, [metadata.version_id!]);
    if (existing) assertImmutableIdentity(existing, record);
    const parents = metadata.parent_version_ids ?? (metadata.parent_version_id ? [metadata.parent_version_id] : []);
    const identity = { object_id: metadata.object_id, parent_version_id: metadata.parent_version_id, version_id: metadata.version_id! };
    const edges = parents.map((parent_version_id, ordinal) => ({ version_id: metadata.version_id!, parent_version_id, ordinal }));
    await validateStoredVersionDependencies(tx, [identity], includeLegacyVersionParents([identity], edges));
    await adoptVersionBodies(tx, record);
    if (existing && !(existing.body_state !== 'readable' && completeTombstone)) return 'identical' as const;
    const hash = record.body.kind === 'readable' ? record.body.ref.hash : null;
    if (existing) {
      await tx.run(`UPDATE node_sync_versions SET body_state = 'readable', body_blob_hash = ?,
        snapshot_json = json_set(snapshot_json, '$.body_blob_hash', ?) WHERE version_id = ?`,
      [hash, hash, metadata.version_id!]);
      return 'identical' as const;
    }
    await tx.run(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id, host_name,
      created_at, content_hash, body_text, snapshot_json, body_state, body_blob_hash)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [metadata.version_id!, metadata.object_id, metadata.parent_version_id, metadata.host_name!,
      metadata.version_created_at!, metadata.content_hash ?? '',
      JSON.stringify({ ...metadata.snapshot, content: null, body_blob_hash: hash }), record.body.kind, hash]);
    for (const edge of edges) await tx.run(`INSERT INTO node_sync_version_parents
      (version_id, parent_version_id, ordinal) VALUES (?, ?, ?) ON CONFLICT(version_id, parent_version_id) DO NOTHING`,
    [edge.version_id, edge.parent_version_id, edge.ordinal]);
    return 'created' as const;
  });
}

function assertImmutableIdentity(existing: StoredIdentity, record: VerifiedFramedSyncNode) {
  const metadata = record.metadata;
  if (existing.object_id !== metadata.object_id || existing.content_hash !== (metadata.content_hash ?? '') ||
      existing.host_name !== metadata.host_name || existing.created_at !== metadata.version_created_at ||
      (existing.body_state === 'readable' && record.body.kind === 'readable' && existing.body_blob_hash !== record.body.ref.hash)) {
    throw new Error(`sync_pack_node_version_immutable_mismatch:${metadata.version_id}`);
  }
}

async function adoptVersionBodies(db: DbPort, record: VerifiedFramedSyncNode) {
  if (record.body.kind !== 'readable') return;
  const declared = record.metadata.snapshot.body_blob_hash;
  if (declared && declared !== record.body.ref.hash) throw new Error('node_version_projection_identity_invalid');
  await adoptVerifiedBody(db, record.body.ref, record.metadata.updated_at);
  for (const entry of record.metadata.snapshot.text_alternatives ?? []) {
    const ref = await loadVerifiedBodyRef(db, entry.body_blob_hash);
    if (!ref) throw new Error(`text_alternative_body_unavailable:${entry.id}`);
    await adoptVerifiedBody(db, ref, record.metadata.updated_at);
  }
  await recordFramedSyncResourceAvailability(db,
    (record.metadata.snapshot.text_alternatives ?? []).map((entry) => entry.body_blob_hash), true);
}
