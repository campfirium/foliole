import type { DbPort, DbRow } from './dbPort.js';
import { applyRetiredParentOrderBody } from './parentOrderRetiredBodyApply.js';
import { hashText } from './syncNodeResolution.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';
import { parentOrderFactPayload, parseManagedParentOrderFact, parseParentOrderFact } from './syncParentOrderFact.js';
import { insertParentOrderVersion } from './syncParentOrderVersionStore.js';

/** Facts can arrive out of ancestry order; no head adopts them before lineage is complete. */
export async function applyParentOrderFactObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('sync_parent_order_fact_invalid');
  const raw: unknown = JSON.parse(record.payload_json);
  const managed = parseManagedParentOrderFact(raw);
  if (record.object_id !== managed.version.versionId) throw new Error('sync_parent_order_fact_hash_mismatch');
  if (managed.version.order === null) return applyRetiredParentOrderBody(port, raw, record.content_hash);
  const fact = parseParentOrderFact(JSON.parse(record.payload_json));
  const payload = parentOrderFactPayload(fact.parentId, fact.version, fact.createdAt);
  if (record.object_id !== fact.version.versionId ||
      record.content_hash !== hashText(JSON.stringify(payload))) {
    throw new Error('sync_parent_order_fact_hash_mismatch');
  }
  await insertParentOrderVersion(port, fact.parentId, fact.version, fact.createdAt, 'staged');
}

export async function applySyncPackParentOrderFacts(port: DbPort, incomingAlias = 'inc') {
  if (!/^[a-z][a-z0-9_]*$/u.test(incomingAlias)) throw new Error('sync_identity_schema_invalid');
  const facts = await port.query<SyncPackSyncObjectRecord & DbRow>(`SELECT * FROM
    ${incomingAlias}.sync_objects WHERE object_type = 'order_version' ORDER BY object_id`);
  for (const fact of facts) await applyParentOrderFactObject(port, fact);
}
