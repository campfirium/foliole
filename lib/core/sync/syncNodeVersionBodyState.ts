import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { PRESERVE_RELEASED_MAIN_HASH_SQL, releasedVersionBodyHashesWithPort } from '../database/releasedVersionBodyHashes.js';
import { collectTextBodyBlobCandidatesWithPort } from '../database/textBodyBlobCollection.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';
import { REQUEST_CHAIN_HEAD_SQL } from './requestSyncBodyReferencePolicy.js';
import { planStoredTopicBodies } from './requestSyncBodyRetention.js';
import { validateTopicTextBodies } from './topicTextBodies.js';

const RETIRED_BODY_SQL = "body_text IS NULL AND json_extract(snapshot_json, '$.body_deleted') = 1";
const BODY_HASH_MISSING_SQL = "json_extract(snapshot_json, '$.body_blob_hash') IS NULL";
const BODY_REPAIR_NEEDED_SQL = `(body_text IS NULL OR ${BODY_HASH_MISSING_SQL} OR
  json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternatives'), '[]')) !=
  json_array_length(COALESCE(json_extract(snapshot_json, '$.text_alternative_bodies'), '[]')))
  AND COALESCE(json_extract(snapshot_json, '$.body_deleted'), 0) = 0`;

export const STORED_NODE_VERSION_BODY_REPAIR_COLUMNS = `(${BODY_REPAIR_NEEDED_SQL}) AS body_repair_needed,
  (${RETIRED_BODY_SQL} AND ${BODY_HASH_MISSING_SQL}) AS retired_hash_missing`;

export type StoredNodeVersionBodyRepairState = { body_repair_needed: number; retired_hash_missing: number };

/** A deletion is monotone; a complete old publication cannot resurrect its body. */
export async function applyStoredNodeVersionBodyState(port: DbPort, record: NativeSyncNodeRecord,
  stored: StoredNodeVersionBodyRepairState) {
  if (record.snapshot.body_deleted === true) {
    const [node] = await port.query<{ kind: string; current_version_id: string | null }>(
      REQUEST_CHAIN_HEAD_SQL, [record.object_id]);
    if (node?.kind === 'topic' && node.current_version_id) {
      const plan = await planStoredTopicBodies(port, record.object_id, node.current_version_id, Number.MAX_SAFE_INTEGER);
      if (!plan.removed.includes(record.version_id!)) return;
    }
    const released = record.snapshot.kind === 'topic'
      ? await releasedVersionBodyHashesWithPort(port, record.version_id!) : null;
    if (released?.mainBodyHash && !released.hasStoredMainBodyHash) {
      await port.run(PRESERVE_RELEASED_MAIN_HASH_SQL, [released.mainBodyHash, record.version_id!]);
    }
    await port.run(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL,
        '$.body_deleted', json('true')), '$.text_alternative_bodies')
      WHERE version_id = ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE current_version_id = ?)
        AND NOT EXISTS (SELECT 1 FROM sync_object_state WHERE object_type = 'node' AND current_version_id = ?)`,
    [record.version_id!, record.version_id!, record.version_id!]);
    if (released?.hashes.length) await collectTextBodyBlobCandidatesWithPort(port, released.hashes);
    return;
  }
  const body = record.body_text ?? record.snapshot.content;
  if (typeof body !== 'string') return;
  const bodyHash = hashTextBody(body);
  if (record.snapshot.body_blob_hash && record.snapshot.body_blob_hash !== bodyHash) {
    throw new Error('sync_node_version_body_hash_mismatch');
  }
  const alternatives = validateTopicTextBodies(record.snapshot.text_alternatives ?? [], record.alternative_bodies ?? []);
  if (record.snapshot.kind === 'topic' && stored.retired_hash_missing) {
    await storeRetiredNodeBodyHash(port, record.version_id!, bodyHash);
  }
  if (!stored.body_repair_needed) return;
  await port.run(`UPDATE node_sync_versions SET body_text = ?,
    snapshot_json = json_set(snapshot_json, '$.body_blob_hash', ?, '$.text_alternative_bodies', json(?))
    WHERE version_id = ? AND (${BODY_REPAIR_NEEDED_SQL})`,
  [body, bodyHash, JSON.stringify(alternatives), record.version_id!]);
}

/** Retirement can learn an existing body's identity without restoring its discarded bytes. */
export async function storeRetiredNodeBodyHash(port: DbPort, versionId: string, hash: string) {
  await port.run(`${PRESERVE_RELEASED_MAIN_HASH_SQL} AND ${RETIRED_BODY_SQL}`, [hash, versionId]);
}
