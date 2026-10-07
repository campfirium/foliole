import { z } from 'zod';

import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';

import { hashText } from './syncNodeResolution.js';

export const nodePositionPayloadSchema = z.object({
  adopted_version_id: z.string().min(1),
  device_identity_key: z.string().min(1),
  group_id: z.string().min(1),
  library_epoch: z.string().min(1),
  object_id: z.string().min(1),
  pending_version_ids_json: z.string(),
  proof_revision: z.number().int().nonnegative(),
  updated_at: z.string().min(1)
}).strict();
export type NodePositionPayload = z.infer<typeof nodePositionPayloadSchema>;
export type VersionPositionDomain = 'node' | 'parent_child_order';
export const versionPositionStorage = (domain: VersionPositionDomain) => domain === 'node'
  ? { table: 'node_version_member_positions', objectType: 'node_position', versionTable: 'node_sync_versions', ownerColumn: 'object_id' }
  : { table: 'parent_order_member_positions', objectType: 'parent_order_position', versionTable: 'parent_order_versions', ownerColumn: 'parent_id' };

export function nodePositionFactId(position: Pick<NodePositionPayload,
  'group_id' | 'device_identity_key' | 'object_id'>, domain: VersionPositionDomain = 'node') {
  return `${domain === 'node' ? 'pos' : 'ord_pos'}_${hashText(JSON.stringify([position.group_id,
    position.device_identity_key, position.object_id]))}`;
}

export function parseNodePositionPayload(raw: unknown) {
  const payload = nodePositionPayloadSchema.parse(raw);
  const pending = z.array(z.string().min(1)).parse(JSON.parse(payload.pending_version_ids_json));
  if (pending.includes(payload.adopted_version_id) || new Set(pending).size !== pending.length ||
      JSON.stringify([...pending].sort()) !== payload.pending_version_ids_json) {
    throw new Error('node_position_pending_invalid');
  }
  return { payload, pending };
}

/** Store the latest original declaration; relays preserve its revision and complete position set. */
export function nodePositionWriteStatements(value: NodePositionPayload, domain: VersionPositionDomain = 'node') {
  const payload = nodePositionPayloadSchema.parse(value);
  const id = nodePositionFactId(payload, domain);
  const storage = versionPositionStorage(domain);
  return [{ sql: `INSERT INTO ${storage.table}
    (fact_id, group_id, device_identity_key, object_id, library_epoch, proof_revision,
      adopted_version_id, pending_version_ids_json, updated_at, resolved_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(fact_id) DO UPDATE SET library_epoch = excluded.library_epoch,
      proof_revision = excluded.proof_revision, adopted_version_id = excluded.adopted_version_id,
      pending_version_ids_json = excluded.pending_version_ids_json,
      updated_at = excluded.updated_at, resolved_revision = NULL`,
  params: [id, payload.group_id, payload.device_identity_key, payload.object_id,
    payload.library_epoch, payload.proof_revision, payload.adopted_version_id,
    payload.pending_version_ids_json, payload.updated_at] },
  { sql: `INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('${storage.objectType}', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, NULL, ?, ?, ?, NULL, 0)
    ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
      content_hash = excluded.content_hash, updated_at = excluded.updated_at,
      last_modified_by_host_name = excluded.last_modified_by_host_name`,
  params: [id, hashText(JSON.stringify(payload)), payload.device_identity_key, payload.updated_at] }];
}
