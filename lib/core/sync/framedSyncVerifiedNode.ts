import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { framedSyncMainBodyBlob, isFramedSyncNodeIdentityFact } from './framedSyncNodeFactContract.js';
import { restoreFramedSyncNodeMetadata, type FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';
import { loadVerifiedBodyRef, type VerifiedBodyRef } from './verifiedBody.js';

export type VerifiedFramedSyncNode = Readonly<{
  metadata: FramedSyncNodeMetadata;
  body: Readonly<{ kind: 'retired' }> | Readonly<{ kind: 'readable'; ref: VerifiedBodyRef }>;
  alternativeBodies: readonly VerifiedBodyRef[];
}>;

/** Ready recovery loads identities and verified references, never the text bytes. */
export async function restoreVerifiedFramedSyncNode(db: DbPort, fact: CanonicalFact): Promise<VerifiedFramedSyncNode> {
  const metadata = restoreFramedSyncNodeMetadata(fact);
  if (isFramedSyncNodeIdentityFact(fact)) return { metadata, body: { kind: 'retired' }, alternativeBodies: [] };
  const main = framedSyncMainBodyBlob(fact);
  if (!main) throw new Error('node_version_projection_body_blob_invalid');
  const bodyRefs = new Map<string, VerifiedBodyRef>();
  for (const descriptor of fact.blobs.filter((blob) => blob.role === 1)) {
    const hash = bytesToHex(descriptor.sha256);
    const ref = await loadVerifiedBodyRef(db, hash);
    if (!ref || BigInt(ref.byteLength) !== descriptor.byteLength) throw new Error('framed_sync_verified_body_unavailable');
    bodyRefs.set(hash, ref);
  }
  const mainRef = bodyRefs.get(bytesToHex(main.sha256));
  if (!mainRef) throw new Error('framed_sync_verified_body_unavailable');
  return { metadata, body: { kind: 'readable', ref: mainRef },
    alternativeBodies: [...bodyRefs.values()].filter((ref) => ref.hash !== mainRef.hash) };
}
