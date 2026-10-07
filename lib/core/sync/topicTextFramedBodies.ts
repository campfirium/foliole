import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { textAlternatives, type TopicTextBody } from './topicTextState.js';

export function projectTopicTextBodyBlobs(record: NativeSyncNodeRecord) {
  const bodies = new Map((record.alternative_bodies ?? []).map((body) => [body.hash, body.text]));
  return textAlternatives(record).map((entry) => {
    const text = bodies.get(entry.body_blob_hash);
    if (text === undefined || hashTextBody(text) !== entry.body_blob_hash) {
      throw new Error('text_alternative_body_unavailable');
    }
    const data = new TextEncoder().encode(text);
    const blob: CanonicalBlob = { byteLength: BigInt(data.byteLength), required: true,
      role: 1, sha256: hexToBytes(entry.body_blob_hash) };
    return { blob, data };
  });
}

export function restoreTopicTextBodyBlobs(record: NativeSyncNodeRecord,
  bodies: readonly TopicTextBody[], descriptors: readonly CanonicalBlob[]) {
  if (!textAlternatives(record).length) return record;
  record.alternative_bodies = textAlternatives(record).map((entry) => {
    const body = bodies.find((value) => value.hash === entry.body_blob_hash);
    const blob = descriptors.find((value) => value.role === 1 && bytesToHex(value.sha256) === entry.body_blob_hash);
    if (!body || !blob || hashTextBody(body.text) !== body.hash ||
        BigInt(new TextEncoder().encode(body.text).byteLength) !== blob.byteLength) {
      throw new Error('text_alternative_body_blob_invalid');
    }
    return body;
  });
  return record;
}
