import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';
import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalBlob, CanonicalFact } from './framedSyncCanonicalManifest.js';
import { validateFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import type { FramedSyncBlobContent } from './framedSyncTransferPayloads.js';

export async function loadFramedExternalDocumentBody(db: DbPort, documentId: string, blob: CanonicalBlob) {
  const [row] = await db.query<{ content: string }>(
    'SELECT content FROM external_documents WHERE document_id = ?', [documentId]);
  if (!row || blob.role !== 5 || !blob.required || blob.byteLength > BigInt(TEXT_BODY_MAX_BYTES)) {
    throw new Error('framed_sync_external_document_body_invalid');
  }
  return validateFramedSyncFrozenBody(blob, new TextEncoder().encode(row.content));
}

export async function selectFramedExternalDocumentBody(db: DbPort, payload: string | null): Promise<CanonicalBlob[]> {
  const document = payload === null ? null : JSON.parse(payload) as { body_blob_hash?: unknown; document_id?: unknown };
  if (!document || typeof document.body_blob_hash !== 'string') return [];
  if (typeof document.document_id !== 'string') throw new Error('framed_sync_external_document_body_invalid');
  const [row] = await db.query<{ content: string }>(
    'SELECT content FROM external_documents WHERE document_id = ?', [document.document_id]);
  if (!row) throw new Error('framed_sync_external_document_body_invalid');
  const data = new TextEncoder().encode(row.content);
  if (data.byteLength > TEXT_BODY_MAX_BYTES || bytesToHex(sha256(data)) !== document.body_blob_hash) {
    throw new Error('framed_sync_external_document_body_invalid');
  }
  return [{ byteLength: BigInt(data.byteLength), required: true, role: 5, sha256: hexToBytes(document.body_blob_hash) }];
}

export function assertFramedExternalDocumentBody(fact: CanonicalFact, payload: string | null) {
  if (!fact.blobs.length) return;
  const hash = payload === null ? null : JSON.parse(payload).body_blob_hash as unknown;
  if (fact.objectType !== 'external_document' || fact.blobs.length !== 1 ||
      fact.blobs[0]!.role !== 5 || !fact.blobs[0]!.required ||
      bytesToHex(fact.blobs[0]!.sha256) !== hash) {
    throw new Error('framed_sync_external_document_body_invalid');
  }
}

export function decodeFramedExternalDocumentBodies(
  facts: readonly CanonicalFact[], blobs: readonly FramedSyncBlobContent[]
) {
  const descriptors = facts.flatMap((fact) => fact.blobs);
  const byHash = new Map(blobs.map((blob) => [bytesToHex(blob.sha256), blob]));
  const required = new Set(descriptors.map((blob) => bytesToHex(blob.sha256)));
  if (byHash.size !== blobs.length || byHash.size !== required.size) {
    throw new Error('framed_sync_blob_content_set_mismatch');
  }
  return descriptors.map((descriptor) => {
    const hash = bytesToHex(descriptor.sha256);
    const content = byHash.get(hash);
    if (!content || descriptor.role !== 5 || !descriptor.required || descriptor.byteLength > BigInt(TEXT_BODY_MAX_BYTES) ||
        descriptor.byteLength !== BigInt(content.data.byteLength) || bytesToHex(sha256(content.data)) !== hash) {
      throw new Error('framed_sync_external_document_body_invalid');
    }
    return { hash, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content.data) };
  });
}

/** Complete the existing external-document payload before its ordinary business writer runs. */
export function withFramedExternalDocumentBody<T extends NativeSyncObjectRecord>(record: T,
  bodies: readonly { hash: string; text: string }[]): T {
  if (record.object_type !== 'external_document' || record.deleted_at || !record.payload_json) return record;
  const payload = JSON.parse(record.payload_json) as { body_blob_hash?: unknown };
  if (typeof payload.body_blob_hash !== 'string') return record;
  const body = bodies.find((entry) => entry.hash === payload.body_blob_hash);
  if (!body) throw new Error('framed_sync_external_document_body_invalid');
  const data = new TextEncoder().encode(body.text);
  if (data.byteLength > TEXT_BODY_MAX_BYTES || bytesToHex(sha256(data)) !== body.hash) {
    throw new Error('framed_sync_external_document_body_invalid');
  }
  return { ...record, payload_json: JSON.stringify({ ...payload, content: body.text }) };
}
