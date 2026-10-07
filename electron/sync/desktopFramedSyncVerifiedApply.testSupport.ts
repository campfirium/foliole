import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { migrateFramedSyncAvailableBlobs } from '../../lib/core/database/framedSyncAvailableBlobMigration.js';
import { migrateStoredSourceSearchQueue } from '../../lib/core/database/storedSourceSearchQueueMigration.js';
import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

import { stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';
import { loadDesktopFramedSyncReadyFacts } from './desktopFramedSyncReadyFacts.js';

export async function verifiedDesktopReadyFixture(text: string) {
  const host = textDevice();
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx); await migrateBodyContentOwners(tx, 'desktop');
    await migrateFramedSyncAvailableBlobs(tx, 'desktop');
    await migrateStoredSourceSearchQueue(tx);
  });
  host.sqlite.exec('DROP TABLE content_blob_data');
  const record = textBranch('verified-version', text, undefined, '2026-10-07T00:00:00.000Z');
  const projection = projectFramedSyncNodeRecord(record);
  const manifest = projection.manifest;
  const fact = manifest.facts[0]!;
  const descriptor = manifest.blobs[0]!;
  const context = { groupId: 'group', protocolVersion: 22 as const, receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch' };
  const contentId = await canonicalContentId(manifest);
  const published = { context, contentId, manifestHash: contentId, transferId: await canonicalTransferId(context, contentId) };
  const staging = createDesktopFramedSyncStaging(host.db, 'chunked');
  const proposal = { ...published, factCount: 1n, blobCount: 1n, totalBlobBytes: descriptor.byteLength };
  const { reservationId } = await staging.admitInboundProposal(proposal);
  const attemptId = new Uint8Array(16).fill(7);
  await staging.commitInboundHeaderDeclaration({ attemptId, blobs: manifest.blobs, facts: [{ factId: fact.factId,
    globalId: fact.globalId, kind: fact.kind, objectType: fact.objectType, sharedStateHash: fact.sharedStateHash,
    requiredBlobHashes: fact.blobs.map((blob) => blob.sha256) }], proposal, published: proposal, reservationId });
  await stageDesktopFramedSyncFact({ fact, staging, frame: { attemptId, transferId: published.transferId,
    authenticatedPlaintext: encodeValidatedProtocolMessage('fact', factToWire(fact)),
    ciphertext: Uint8Array.of(1, 2), frameHeader: new Uint8Array(16), frameType: 3,
    preamble: new Uint8Array(96), sequence: 0n } });
  await staging.commitBlobOfferAndMissingSet({ blobs: manifest.blobs, transferId: published.transferId });
  for (let offset = 0; offset < projection.bodyBlob.length; offset += BODY_CONTENT_CHUNK_BYTES) {
    await staging.writeBlobChunk({ attemptId, transferId: published.transferId, sha256: descriptor.sha256,
      offset: BigInt(offset), data: projection.bodyBlob.slice(offset, offset + BODY_CONTENT_CHUNK_BYTES) });
  }
  await staging.finalizeInboundAttempt({ attemptId, blobCount: 1n, factCount: 1n,
    manifestHash: contentId, transferId: published.transferId });
  await staging.verifyAndMarkBlobAvailable(published.transferId, attemptId, descriptor.sha256);
  await staging.markReadyToApply(published.transferId);
  const transfer = await loadDesktopFramedSyncReadyFacts(host.db, published);
  if (!transfer) throw new Error('fixture_ready_missing');
  return { ...host, record, descriptor, published, transfer, staging };
}

export function verifiedApplyBusinessRows(host: Awaited<ReturnType<typeof verifiedDesktopReadyFixture>>) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state', 'content_bodies',
    'content_body_chunks', 'content_blobs', 'node_version_local_proof_state', 'node_version_local_source_revisions',
    'node_version_device_revisions', 'node_version_local_origins', 'node_version_local_holds',
    'framed_sync_inventory', 'framed_sync_version_summary', 'framed_sync_fact_summary',
    'framed_sync_resource_availability', 'framed_sync_receipts'].map((table) =>
    host.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

export function verifiedApplyReadyRows(host: Awaited<ReturnType<typeof verifiedDesktopReadyFixture>>) {
  return ['framed_sync_inbound_transfers', 'framed_sync_inbound_attempts', 'framed_sync_inbound_frames',
    'framed_sync_blob_pins', 'framed_sync_available_blobs', 'framed_sync_available_blob_chunks'].map((table) =>
    host.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
