import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { decodeFramedSyncManifest } from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import type { FramedSyncContext } from './framedSyncContract.js';

/** Receipt retries need only the retained identity, even after transport payloads retire. */
export async function inspectFramedSyncPublishedReceipt(db: DbPort, context: FramedSyncContext, transferId: string)
  : Promise<{ content_id: string; resource_storage_keys: string[] }> {
  if (!/^[a-f0-9]{64}$/u.test(transferId)) throw new Error('framed_sync_transfer_id_invalid');
  const [row] = await db.query<{ content_id: string }>(
    `SELECT lower(hex(content_id)) AS content_id FROM framed_sync_outbound_publications
     WHERE hex(transfer_id) = ? AND group_id = ? AND sender_device_id = ?
       AND sender_library_epoch = ? AND receiver_device_id = ? AND receiver_library_epoch = ?`,
    [transferId.toUpperCase(), context.groupId, context.senderDeviceId,
      context.senderLibraryEpoch, context.receiverDeviceId, context.receiverLibraryEpoch]);
  if (!row) throw new Error('framed_sync_publication_context_missing');
  if (!/^[a-f0-9]{64}$/u.test(row.content_id) ||
      bytesToHex(await canonicalTransferId(context, hexToBytes(row.content_id))) !== transferId) {
    throw new Error('framed_sync_publication_identity_mismatch');
  }
  return { content_id: row.content_id, resource_storage_keys: [] };
}

/** The frozen publication, never a new business projection, defines bytes supplied after restart. */
export async function loadFramedSyncPublishedManifest(db: DbPort, context: FramedSyncContext, transferId: string) {
  if (!/^[a-f0-9]{64}$/u.test(transferId)) throw new Error('framed_sync_transfer_id_invalid');
  const [row] = await db.query<{ content_id: string; manifest_json: string }>(
    `SELECT lower(hex(content_id)) AS content_id, manifest_json FROM framed_sync_outbound_publications
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
  return { manifest, contentId };
}
