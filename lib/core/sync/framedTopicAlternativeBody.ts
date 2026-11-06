import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';
import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalBlob, CanonicalFact } from './framedSyncCanonicalManifest.js';
import type { FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { validateSyncBodyBytes } from './syncBodyBytes.js';
import { validateTopicAlternativeRecord } from './topicAlternativeRecord.js';

export function projectTopicAlternativeBody(payload: string | null) {
  if (!payload) return { payload: null, blobs: [] as CanonicalBlob[] };
  const record = validateTopicAlternativeRecord(JSON.parse(payload));
  const { body_text, ...metadata } = record;
  const data = new TextEncoder().encode(body_text);
  if (data.byteLength > TEXT_BODY_MAX_BYTES) throw new Error('text_body_requires_partition');
  return { payload: JSON.stringify(metadata), blobs: record.status === 'available' ? [{
    byteLength: BigInt(data.byteLength), sha256: hexToBytes(record.body_blob_hash), required: true, role: 1
  }] : [] };
}

export function assertTopicAlternativeBody(fact: CanonicalFact, payload: string | null) {
  const record = payload ? JSON.parse(payload) : null;
  const required = record?.status === 'available';
  const blob = fact.blobs[0];
  if (fact.blobs.length !== (required ? 1 : 0) || (required && (!blob || blob.role !== 1 || !blob.required
    || blob.byteLength > BigInt(TEXT_BODY_MAX_BYTES) || bytesToHex(blob.sha256) !== record.body_blob_hash))) {
    throw new Error('text_alternative_body_descriptor_invalid');
  }
}

export async function loadTopicAlternativeBody(db: DbPort, id: string, blob: CanonicalBlob) {
  const [row] = await db.query<{ body_text: string }>(
    "SELECT body_text FROM node_text_alternatives WHERE alternative_id = ? AND status = 'available'", [id]);
  if (!row) throw new Error('framed_sync_source_changed');
  return validateSyncBodyBytes(blob, new TextEncoder().encode(row.body_text));
}

export async function completeTopicAlternativeBody<T extends NativeSyncObjectRecord>(db: DbPort, fact: CanonicalFact,
  record: T, loadBody?: FramedBodyLoader): Promise<T> {
  if (record.deleted_at || !record.payload_json) return record;
  const payload = JSON.parse(record.payload_json);
  const blob = fact.blobs[0];
  if (payload.status === 'available' && (!blob || !loadBody)) throw new Error('text_alternative_body_unavailable');
  const body = blob ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(validateSyncBodyBytes(blob, await loadBody!(db, blob))) : '';
  const complete = validateTopicAlternativeRecord({ ...payload, body_text: body });
  return { ...record, payload_json: JSON.stringify(complete) };
}
