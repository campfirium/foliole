import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { CanonicalFact, CanonicalValue } from './framedSyncCanonicalManifest.js';
import { assertFramedExternalDocumentBody, selectFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { framedSyncObjectStateFactId, FRAMED_SYNC_STATE_OBJECT_TYPES, isFramedSyncSharedStateObject } from './framedSyncObjectStateInventory.js';
import { readFramedSyncObjectPayload } from './framedSyncObjectStatePayload.js';
import { applyNodeMemberPosition } from './nodeVersionMemberPositionApply.js';
import { persistSyncIdentityParentOrderMerges, stageSyncIdentityParentOrderRecordMerge } from './syncIdentityParentOrderApply.js';
import { applySyncObjectInTransaction, type ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';

interface StateRow extends DbRow {
  content_hash: string;
  current_version_id: string | null;
  deleted_at: string | null;
  updated_at: string;
}
const nullable = (value: string | null): CanonicalValue => value === null
  ? { kind: 'null' } : { kind: 'string', value };

export async function selectFramedSyncObjectStateFact(
  db: DbPort, key: { globalId: string; objectType: string }, factId: string
): Promise<CanonicalFact> {
  assertType(key.objectType, key.globalId);
  const [state] = await db.query<StateRow>(`SELECT content_hash, current_version_id, deleted_at, updated_at
    FROM sync_object_state WHERE object_type = ? AND object_id = ?`, [key.objectType, key.globalId]);
  if (!state || factId !== framedSyncObjectStateFactId(key.objectType, state.content_hash, state.current_version_id)) throw new Error('framed_sync_source_changed');
  const payload = state.deleted_at ? null : await readFramedSyncObjectPayload(db, key);
  if (!state.deleted_at && !payload) throw new Error('framed_sync_source_changed');
  const blobs = key.objectType === 'external_document'
    ? await selectFramedExternalDocumentBody(db, payload) : [];
  return { blobs, body: [
    { name: 'content_hash', value: nullable(state.content_hash) },
    { name: 'current_version_id', value: nullable(state.current_version_id) },
    { name: 'deleted_at', value: nullable(state.deleted_at) },
    { name: 'payload_json', value: nullable(payload) },
    { name: 'updated_at', value: nullable(state.updated_at) }
  ], factId, globalId: key.globalId, kind: 1, objectType: key.objectType,
  sharedStateHash: hexToBytes(state.content_hash) };
}

export function restoreFramedSyncObjectStateFact(fact: CanonicalFact): NativeSyncObjectRecord & { current_version_id: string | null } {
  const objectType = assertType(fact.objectType, fact.globalId);
  const fields = new Map(fact.body.map((field) => [field.name, field.value]));
  if (fact.kind !== 1 || fields.size !== 5 || fact.body.length !== 5) {
    throw new Error('framed_sync_object_state_fact_invalid');
  }
  const string = (key: string, required = false) => {
    const value = fields.get(key);
    if (value?.kind === 'null' && !required) return null;
    if (value?.kind !== 'string' || (required && !value.value)) {
      throw new Error('framed_sync_object_state_fact_invalid');
    }
    return value.value;
  };
  const contentHash = string('content_hash', true)!;
  const currentVersionId = string('current_version_id');
  const deletedAt = string('deleted_at');
  const payload = string('payload_json');
  assertFramedExternalDocumentBody(fact, payload);
  if (fact.factId !== framedSyncObjectStateFactId(objectType, contentHash, currentVersionId) || bytesToHex(fact.sharedStateHash) !== contentHash ||
      (!deletedAt && payload === null)) throw new Error('framed_sync_object_state_fact_invalid');
  return { object_type: objectType, object_id: fact.globalId, content_hash: contentHash,
    current_version_id: currentVersionId, deleted_at: deletedAt, payload_json: payload, updated_at: string('updated_at', true)! };
}

export async function applyFramedSyncObjectStateRecord(db: DbPort,
  record: NativeSyncObjectRecord & { current_version_id?: string | null },
  options: ApplySyncObjectsWithDbPortOptions = {}) {
  if (record.object_type === 'order_version') return applyParentOrderFactObject(db, record);
  if (record.object_type === 'node_position') return applyNodeMemberPosition(db, record);
  if (record.object_type === 'parent_child_order') {
    const merged = await stageSyncIdentityParentOrderRecordMerge(db, { ...record,
      parent_id: record.object_id, current_version_id: record.current_version_id ?? null });
    await applySyncObjectInTransaction(db, record);
    if (merged) await persistSyncIdentityParentOrderMerges(db, [merged], 'sync-remote');
    return;
  }
  return applySyncObjectInTransaction(db, record, options);
}

function assertType(type: string, objectId: string): (typeof FRAMED_SYNC_STATE_OBJECT_TYPES)[number] {
  const known = FRAMED_SYNC_STATE_OBJECT_TYPES.find((candidate) => candidate === type && isFramedSyncSharedStateObject(type, objectId));
  if (!known) throw new Error('framed_sync_object_state_type_invalid');
  return known;
}
