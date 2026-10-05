import { computeSyncContentHash } from '../database/syncState.js';

import { normalizeCanonicalPrivateStatePayload } from './canonicalPrivateStatePayload.js';
import { buildCanonicalSyncTombstone } from './canonicalSyncTombstone.js';

export function hasCanonicalPrivateStateContentHash(record: {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  payload_json: string | null;
}) {
  if (record.object_type !== 'setting' && record.object_type !== 'view_state') return true;
  if (record.deleted_at) {
    return record.payload_json === null && computeSyncContentHash(
      record.object_type, buildCanonicalSyncTombstone(record.object_id)
    ) === record.content_hash;
  }
  if (!record.payload_json) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.payload_json);
  } catch {
    return false;
  }
  const payload = normalizeCanonicalPrivateStatePayload(record.object_type, parsed);
  return payload !== null && computeSyncContentHash(record.object_type, payload) === record.content_hash;
}
