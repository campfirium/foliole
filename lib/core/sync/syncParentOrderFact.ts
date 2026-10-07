import { z } from 'zod';

import { NEXT_SYNC_STATE_SEQ_SQL } from '../database/syncStateSequenceSchemaStatements.js';

import { hashText } from './syncNodeResolution.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';

const ids = z.array(z.string().min(1)).refine((values) => new Set(values).size === values.length);
const payloadSchema = z.object({
  child_ids_json: z.string(),
  created_at: z.string().min(1),
  kind: z.enum(['baseline', 'membership', 'merge', 'user']),
  parent_id: z.string().min(1),
  parent_version_ids_json: z.string(),
  version_id: z.string().min(1)
}).strict();

export function parentOrderFactPayload(parentId: string, version: ParentOrderVersion,
  createdAt: string) {
  return payloadSchema.parse({ child_ids_json: JSON.stringify(version.order),
    created_at: createdAt, kind: version.kind, parent_id: parentId,
    parent_version_ids_json: JSON.stringify(version.parentVersionIds),
    version_id: version.versionId });
}

export function parseParentOrderFact(value: unknown) {
  const fact = parseManagedParentOrderFact(value);
  if (fact.version.order === null) throw new Error('sync_parent_order_body_unavailable');
  return { ...fact, version: { ...fact.version, order: fact.version.order } };
}

/** A released arrangement has the same identity and parents, with a JSON null body. */
export function parseManagedParentOrderFact(value: unknown) {
  const payload = payloadSchema.parse(value);
  const raw: unknown = JSON.parse(payload.child_ids_json);
  const order = raw === null ? null : ids.parse(raw);
  const parents = ids.parse(JSON.parse(payload.parent_version_ids_json));
  if (parents.includes(payload.version_id)) throw new Error('sync_parent_order_version_invalid');
  return { parentId: payload.parent_id, createdAt: payload.created_at,
    version: { versionId: payload.version_id, kind: payload.kind, order,
      parentVersionIds: parents } };
}

/** Every immutable order fact has its own globally discoverable sync identity. */
export function parentOrderFactStateStatement(parentId: string, version: ParentOrderVersion,
  createdAt: string) {
  const payload = parentOrderFactPayload(parentId, version, createdAt);
  return parentOrderIdentityStateStatement(version.versionId, hashText(JSON.stringify(payload)), createdAt);
}

export function parentOrderIdentityStateStatement(versionId: string, originalHash: string, createdAt: string) {
  return { sql: `INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_host_name, updated_at, deleted_at, sync_dirty)
    VALUES ('order_version', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, NULL, ?, 'order-fact', ?, NULL, 0)
    ON CONFLICT(object_type, object_id) DO NOTHING`,
  params: [versionId, originalHash, createdAt] };
}
