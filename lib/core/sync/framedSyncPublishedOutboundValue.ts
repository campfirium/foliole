import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { decodeFramedSyncManifest } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { createCompanionFramedSyncOutboundValue } from './framedSyncCompanionOutboundContract.js';
import type { FramedSyncContext } from './framedSyncContract.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { framedSyncPublicationResources } from './framedSyncPublicationResources.js';
import { factToWire } from './framedSyncWireProjection.js';

/** Restore native input from the publication and protected content, without business reads. */
export async function loadFramedSyncPublishedOutboundValue(
  db: DbPort, context: FramedSyncContext, transferId: string
) {
  if (!/^[a-f0-9]{64}$/u.test(transferId)) throw new Error('framed_sync_transfer_id_invalid');
  const [row] = await db.query<{ content_id: string; manifest_json: string }>(
    `SELECT lower(hex(content_id)) AS content_id, manifest_json
     FROM framed_sync_outbound_publications
     WHERE hex(transfer_id) = ? AND group_id = ? AND sender_device_id = ?
       AND sender_library_epoch = ? AND receiver_device_id = ? AND receiver_library_epoch = ?
       AND state = 'published'`,
    [transferId.toUpperCase(), context.groupId, context.senderDeviceId,
      context.senderLibraryEpoch, context.receiverDeviceId, context.receiverLibraryEpoch]);
  if (!row) throw new Error('framed_sync_publication_context_missing');
  const manifest = decodeFramedSyncManifest(row.manifest_json);
  const contentId = await canonicalContentId(manifest);
  if (bytesToHex(contentId) !== row.content_id ||
      bytesToHex(await canonicalTransferId(context, contentId)) !== transferId) {
    throw new Error('framed_sync_publication_identity_mismatch');
  }
  const resources = framedSyncPublicationResources(manifest);
  const blobs = [];
  for (const blob of manifest.blobs) {
    const hash = bytesToHex(blob.sha256);
    if ((blob.role === 1 || blob.role === 5)) {
      const [body] = await db.query<{ data_hex: string }>(
        'SELECT hex(data) AS data_hex FROM content_blob_data WHERE hash = ?', [hash]);
      if (!body) throw new Error('framed_sync_published_body_unavailable');
      const data = hexToBytes(body.data_hex);
      if (BigInt(data.byteLength) !== blob.byteLength || bytesToHex(sha256(data)) !== hash) {
        throw new Error('framed_sync_published_body_unavailable');
      }
      blobs.push({ blob, dataText: new TextDecoder('utf-8', { fatal: true }).decode(data) });
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
