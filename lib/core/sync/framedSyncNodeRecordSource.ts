import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalBlob, CanonicalFact } from './framedSyncCanonicalManifest.js';
import { loadFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import { framedSyncMainBodyBlob, isFramedSyncNodeIdentityFact } from './framedSyncNodeFactContract.js';
import { restoreFramedSyncNodeIdentityFact, restoreFramedSyncNodeMetadata, restoreFramedSyncNodeRecord } from './framedSyncNodeRestore.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';

/** Facts contain signed metadata; the enclosing ready owner retains the immutable bytes. */
export type FramedBodyLoader = (db: DbPort, blob: CanonicalBlob) => Promise<Uint8Array>;

export function framedSyncNodeRecordSource(facts: readonly CanonicalFact[], loadBody: FramedBodyLoader = loadFramedSyncFrozenBody): SyncNodeRecordSource {
  const entries = new Map(facts.map((fact) => [restoreFramedSyncNodeMetadata(fact), fact]));
  const factFor = (metadata: SyncNodeRecordMetadata) => {
    const fact = entries.get(metadata);
    if (!fact) throw new Error('canonical_fact_source_changed');
    return fact;
  };
  return { records: [...entries.keys()], isIdentityOnly: (metadata) => isFramedSyncNodeIdentityFact(factFor(metadata)),
    load: (db, metadata) => restoreOwnedFramedSyncNode(db, factFor(metadata), loadBody) };
}

export async function restoreOwnedFramedSyncNode(db: DbPort, fact: CanonicalFact, loadBody: FramedBodyLoader = loadFramedSyncFrozenBody) {
  if (isFramedSyncNodeIdentityFact(fact)) return restoreFramedSyncNodeIdentityFact(fact);
  const main = framedSyncMainBodyBlob(fact);
  if (!main) throw new Error('node_version_projection_body_blob_invalid');
  const alternativeBodies = [];
  for (const blob of fact.blobs.filter((descriptor) => descriptor.role === 1 && descriptor !== main)) {
    if (blob.byteLength > BigInt(TEXT_BODY_MAX_BYTES)) throw new Error('text_body_requires_partition');
    const data = await loadBody(db, blob);
    alternativeBodies.push({ hash: bytesToHex(blob.sha256),
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data) });
  }
  if (main.byteLength > BigInt(TEXT_BODY_MAX_BYTES)) throw new Error('text_body_requires_partition');
  return restoreFramedSyncNodeRecord({ fact, manifestBlob: main,
    bodyBlob: await loadBody(db, main), alternativeBodies });
}
