import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { canonicalContentId, canonicalTransferId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import { ensureFramedSyncMissingResourceDemand } from '../../lib/core/sync/framedSyncResourceDemands.js';
import { projectFramedSyncResourceFact } from '../../lib/core/sync/framedSyncResourceFact.js';
import { factToWire } from '../../lib/core/sync/framedSyncWireProjection.js';
import { publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import { stageDesktopFramedSyncFact } from './desktopFramedSyncProcessInbound.js';

export async function desktopResourceReadyFixture() {
  const host = textDevice();
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-resource-ready-'));
  const assetsDir = path.join(root, 'Assets');
  publishAttachmentLibraryPathSnapshot({ assetsDir, libraryScope: root });
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(256, 7)]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const resource = { contentHash: hash, storageKey: `${hash}.png`, role: 2 as const };
  const fact = projectFramedSyncResourceFact({ demandId: 'demand-1', globalId: 'article', versionId: 'version',
    bodyHash: 'a'.repeat(64), sharedStateHash: new Uint8Array(32).fill(4) }, resource, BigInt(bytes.length));
  const manifest = { facts: [fact], blobs: fact.blobs };
  const context = { groupId: 'group', protocolVersion: 22 as const, senderDeviceId: 'sender',
    senderLibraryEpoch: 's', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r' };
  await ensureFramedSyncMissingResourceDemand(host.db, { ...context, globalId: 'article',
    versionId: 'version', bodyHash: 'a'.repeat(64), storageKey: resource.storageKey }, () => 'demand-1');
  const contentId = await canonicalContentId(manifest);
  const published = { context, contentId, manifestHash: contentId,
    transferId: await canonicalTransferId(context, contentId) };
  const proposal = { ...published, factCount: 1n, blobCount: 1n, totalBlobBytes: BigInt(bytes.length) };
  const staging = createDesktopFramedSyncStaging(host.db);
  const { reservationId } = await staging.admitInboundProposal(proposal);
  const attemptId = new Uint8Array(16).fill(8);
  await staging.commitInboundHeaderDeclaration({ attemptId, proposal, published: proposal, reservationId,
    blobs: manifest.blobs, facts: [{ factId: fact.factId, globalId: fact.globalId, kind: fact.kind,
      objectType: fact.objectType, sharedStateHash: fact.sharedStateHash,
      requiredBlobHashes: fact.blobs.map((blob) => blob.sha256) }] });
  await stageDesktopFramedSyncFact({ fact, staging, frame: {
    attemptId, transferId: published.transferId, sequence: 0n, frameType: 3,
    authenticatedPlaintext: encodeValidatedProtocolMessage('fact', factToWire(fact)),
    ciphertext: Uint8Array.of(1), frameHeader: new Uint8Array(16), preamble: new Uint8Array(96) } });
  await staging.commitBlobOfferAndMissingSet({ blobs: manifest.blobs, transferId: published.transferId });
  const store = new DesktopFramedSyncInboundResourceStore({ attemptId,
    descriptors: manifest.blobs, staging, transferId: published.transferId });
  await store.append(fact.blobs[0]!.sha256, 0n, bytes);
  await staging.finalizeInboundAttempt({ attemptId, blobCount: 1n, factCount: 1n,
    manifestHash: contentId, transferId: published.transferId });
  await store.complete([], [resource]);
  await staging.markReadyToApply(published.transferId);
  return { ...host, root, assetsDir, bytes, hash, resource, fact, published, staging };
}
