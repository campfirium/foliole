import { computeSyncContentHash } from '../database/syncState.js';

import { normalizeCanonicalExternalResourcePayload } from './canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from './canonicalSyncTombstone.js';

export function hasCanonicalExternalResourceContentHash(record: {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  payload_json: string | null;
}) {
  if (record.object_type !== 'external_document' && record.object_type !== 'external_folder') return true;
  if (record.deleted_at) return record.payload_json === null && record.content_hash === computeSyncContentHash(
    record.object_type, buildCanonicalSyncTombstone(record.object_id)
  );
  if (!record.payload_json) return false;
  let parsed: unknown;
  try { parsed = JSON.parse(record.payload_json); } catch { return false; }
  const payload = normalizeCanonicalExternalResourcePayload(record.object_type, parsed);
  return payload !== null && record.content_hash === computeSyncContentHash(record.object_type, payload);
}
