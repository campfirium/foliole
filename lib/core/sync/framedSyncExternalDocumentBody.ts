import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalBlob, CanonicalFact } from './framedSyncCanonicalManifest.js';
import type { FramedSyncBlobContent } from './framedSyncTransferPayloads.js';

export async function selectFramedExternalDocumentBody(db: DbPort, payload: string | null): Promise<CanonicalBlob[]> {
  const hash = payload === null ? null : JSON.parse(payload).body_blob_hash as unknown;
  if (typeof hash !== 'string') return [];
  const [row] = await db.query<{ data_hex: string }>(
    'SELECT hex(data) AS data_hex FROM content_blob_data WHERE hash = ?', [hash]);
  if (!row) return [];
  const data = hexToBytes(row.data_hex);
  if (bytesToHex(sha256(data)) !== hash) throw new Error('framed_sync_external_document_body_invalid');
  return [{ byteLength: BigInt(data.byteLength), required: true, role: 5, sha256: hexToBytes(hash) }];
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
    if (!content || descriptor.role !== 5 || !descriptor.required ||
        descriptor.byteLength !== BigInt(content.data.byteLength) || bytesToHex(sha256(content.data)) !== hash) {
      throw new Error('framed_sync_external_document_body_invalid');
    }
    return { hash, text: new TextDecoder('utf-8', { fatal: true }).decode(content.data) };
  });
}
