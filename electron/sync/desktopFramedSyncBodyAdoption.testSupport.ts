import { sha256 } from '@noble/hashes/sha2.js';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { canonicalContentId, canonicalManifestBytes, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

export async function desktopBodyFixture(text: string, role = 1, storage: 'continuous' | 'chunked' = 'continuous') {
  const host = textDevice();
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
    if (storage === 'chunked') await migrateFramedSyncAvailableBlobs(tx, 'desktop');
  });
  const data = new TextEncoder().encode(text);
  const descriptor = { sha256: sha256(data), byteLength: BigInt(data.length), role, required: true };
  const fact = { blobs: [descriptor], body: [], factId: 'body-fact', globalId: 'node',
    kind: 1, objectType: 'node', sharedStateHash: descriptor.sha256 };
  const manifest = { blobs: [descriptor], facts: [fact] };
  const context = { groupId: 'group', protocolVersion: 22 as const, receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch' };
  const contentId = await canonicalContentId(manifest);
  const published = { contentId, context, manifestHash: contentId, transferId: await canonicalTransferId(context, contentId) };
  const staging = createDesktopFramedSyncStaging(host.db, storage);
  const proposal = { ...published, factCount: 1n, blobCount: 1n, totalBlobBytes: descriptor.byteLength };
  const { reservationId } = await staging.admitInboundProposal(proposal);
  const attemptId = new Uint8Array(16).fill(7);
  await staging.commitInboundHeaderDeclaration({ attemptId, blobs: [descriptor], facts: [{ factId: fact.factId, globalId: fact.globalId,
    kind: fact.kind, objectType: fact.objectType, requiredBlobHashes: [descriptor.sha256],
    sharedStateHash: fact.sharedStateHash }], proposal,
    published: proposal, reservationId });
  const canonical = canonicalManifestBytes(manifest);
  const prefixLength = 4 + new TextEncoder().encode('foliole-framed-sync-content-v1').length + 4;
  await staging.stageInboundFact({ attemptId, transferId: published.transferId, factId: fact.factId,
    factKind: fact.kind, globalId: fact.globalId, objectType: fact.objectType,
    canonicalBytes: canonical.slice(prefixLength, canonical.length - (4 + 4 + 32 + 8 + 4 + 1)) });
  await staging.commitBlobOfferAndMissingSet({ blobs: [descriptor], transferId: published.transferId });
  for (let offset = 0; offset < data.length; offset += BODY_CONTENT_CHUNK_BYTES) {
    await staging.writeBlobChunk({ attemptId, transferId: published.transferId, sha256: descriptor.sha256,
      offset: BigInt(offset), data: data.slice(offset, offset + BODY_CONTENT_CHUNK_BYTES) });
  }
  await staging.finalizeInboundAttempt({ attemptId, blobCount: 1n, factCount: 1n,
    manifestHash: contentId, transferId: published.transferId });
  await staging.verifyAndMarkBlobAvailable(published.transferId, attemptId, descriptor.sha256);
  await staging.markReadyToApply(published.transferId);
  return { ...host, data, descriptor, published, staging };
}
