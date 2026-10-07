import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import { createCompanionFramedSyncOutboundValue } from './framedSyncCompanionOutboundContract.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { framedSyncPublicationResources } from './framedSyncPublicationResources.js';
import { loadFramedSyncPublishedManifest } from './framedSyncPublishedManifest.js';
import { factToWire } from './framedSyncWireProjection.js';
import type { NodeVersionBodyStorage } from './syncNodeTombstoneVersion.js';
import { loadVerifiedBodyRef } from './verifiedBody.js';

/** Restore native input from the publication and protected content, without business reads. */
export async function loadFramedSyncPublishedOutboundValue(
  db: DbPort, context: FramedSyncContext, transferId: string, storage: NodeVersionBodyStorage = 'continuous'
) {
  const { manifest, contentId } = await loadFramedSyncPublishedManifest(db, context, transferId);
  const resources = framedSyncPublicationResources(manifest);
  const blobs = [];
  for (const blob of manifest.blobs) {
    const hash = bytesToHex(blob.sha256);
    if ((blob.role === 1 || blob.role === 5)) {
      if (storage === 'chunked') {
        const bodyRef = await loadVerifiedBodyRef(db, hash);
        if (!bodyRef || BigInt(bodyRef.byteLength) !== blob.byteLength) {
          throw new Error('framed_sync_published_body_unavailable');
        }
        blobs.push({ blob, bodyRef });
        continue;
      }
      const [body] = await db.query<{ data_hex: string }>(
        'SELECT hex(data) AS data_hex FROM content_blob_data WHERE hash = ?', [hash]);
      if (!body) throw new Error('framed_sync_published_body_unavailable');
      const data = hexToBytes(body.data_hex);
      if (BigInt(data.byteLength) !== blob.byteLength || bytesToHex(sha256(data)) !== hash) {
        throw new Error('framed_sync_published_body_unavailable');
      }
      blobs.push({ blob, dataText: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data) });
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
    factMessageBytesList: manifest.facts.map((fact) =>
      encodeValidatedProtocolMessage('fact', factToWire(fact))) });
}
