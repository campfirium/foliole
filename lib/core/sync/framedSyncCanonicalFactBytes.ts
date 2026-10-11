import { canonicalManifestBytes, type CanonicalFact } from './framedSyncCanonicalManifest.js';

const MANIFEST_PREFIX_BYTES = 4 + new TextEncoder().encode('foliole-framed-sync-content-v1').byteLength + 4;

export function canonicalFramedSyncFactBytes(fact: CanonicalFact) {
  const manifest = canonicalManifestBytes({ blobs: fact.blobs, facts: [fact] });
  const blobSuffixBytes = 4 + fact.blobs.reduce((size, blob) => size + 4 + blob.sha256.byteLength + 8 + 4 + 1, 0);
  return manifest.slice(MANIFEST_PREFIX_BYTES, manifest.byteLength - blobSuffixBytes);
}
