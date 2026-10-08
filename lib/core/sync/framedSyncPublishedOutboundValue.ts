import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import { createCompanionFramedSyncOutboundValue } from './framedSyncCompanionOutboundContract.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { framedSyncPublicationResources } from './framedSyncPublicationResources.js';
import { loadFramedSyncPublishedMetadata, readFramedSyncPublishedFact } from './framedSyncPublishedFactSource.js';
import { manifestToWire } from './framedSyncWireProjection.js';

/** Restore native input from the publication and protected content, without business reads. */
export async function loadFramedSyncPublishedOutboundValue(
  db: DbPort, context: FramedSyncContext, transferId: string
) {
  const { manifest, contentId } = await loadFramedSyncPublishedMetadata(db, context, transferId);
  const resources = new Map<string, ReturnType<typeof framedSyncPublicationResources> extends Map<string, infer V> ? V : never>();
  if (manifest.blobs.some((blob) => blob.role !== 1 && blob.role !== 5)) {
    for (let index = 0; index < manifest.facts.length; index += 1) {
      const fact = await readFramedSyncPublishedFact(db, context, transferId, index);
      for (const [hash, resource] of framedSyncPublicationResources({ facts: [fact], blobs: [] })) {
        const prior = resources.get(hash);
        if (prior && prior.storageKey !== resource.storageKey) throw new Error('framed_sync_outbound_resource_identity_conflict');
        resources.set(hash, resource);
      }
    }
  }
  const blobs = [];
  for (const blob of manifest.blobs) {
    const hash = bytesToHex(blob.sha256);
    if ((blob.role === 1 || blob.role === 5)) {
      blobs.push({ blob, frozenBody: true });
    } else {
      const resource = resources.get(hash);
      if (!resource || resource.role !== blob.role) {
        throw new Error('framed_sync_published_resource_unavailable');
      }
      blobs.push({ blob, storageKey: resource.storageKey });
    }
  }
  return createCompanionFramedSyncOutboundValue({ blobs, contentId, manifestHash: contentId,
    publicationState: 'identical', transferId: hexToBytes(transferId),
    headerMessageBytes: encodeValidatedProtocolMessage('transfer_header', {
      attemptId: new Uint8Array(16), manifest: manifestToWire(manifest, context.groupId, contentId),
      transferId: hexToBytes(transferId)
    }) });
}
