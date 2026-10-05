import { canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncContext, PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';

import { wireToBlob } from './desktopFramedSyncProcessWire.js';

type Row = Record<string, unknown>;
const row = (value: unknown) => value as Row;
const bytes = (value: unknown) => new Uint8Array(value as Uint8Array);

export function publishedFromHeader(payload: Readonly<Record<string, unknown>>, context: FramedSyncContext) {
  const manifest = row(payload.manifest);
  const blobs = (manifest.blobs as unknown[]).map(wireToBlob);
  return {
    blobCount: BigInt(blobs.length),
    contentId: bytes(manifest.contentId),
    context,
    factCount: BigInt((manifest.facts as unknown[]).length),
    manifestHash: bytes(manifest.contentId),
    totalBlobBytes: blobs.reduce((total, blob) => total + blob.byteLength, 0n),
    transferId: bytes(payload.transferId)
  } satisfies PublishedTransfer;
}

export async function assertCanonicalTransferIdentity(published: PublishedTransfer) {
  const canonical = await canonicalTransferId(published.context, published.contentId);
  const matches = canonical.byteLength === published.transferId.byteLength &&
    canonical.every((value, index) => value === published.transferId[index]);
  if (!matches) throw new Error('inbound_transfer_identity_mismatch');
}

export function headerFromWire(payload: Readonly<Record<string, unknown>>, published: PublishedTransfer) {
  const manifest = row(payload.manifest);
  return {
    blobs: (manifest.blobs as unknown[]).map(wireToBlob),
    facts: (manifest.facts as unknown[]).map((value) => {
      const item = row(value);
      const identity = row(item.identity);
      return {
        factId: String(identity.factId),
        globalId: String(identity.globalId),
        kind: Number(identity.kind),
        objectType: String(identity.objectType),
        requiredBlobHashes: (item.requiredBlobHashes as unknown[]).map(bytes),
        sharedStateHash: bytes(item.sharedStateHash)
      };
    }),
    published
  };
}
