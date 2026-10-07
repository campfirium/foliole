import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncBigInt, framedSyncBytes, readFramedSyncContext, readFramedSyncHeader,
  sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import { bodyIdentity } from '../../lib/core/sync/bodyContentVerification.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { adoptFramedSyncAvailableBody } from '../../lib/core/sync/framedSyncBodyAdoption.js';
import type { CanonicalBlob } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { PublishedTransfer } from '../../lib/core/sync/framedSyncContract.js';

type ReadyPublication = Pick<PublishedTransfer, 'context' | 'transferId' | 'contentId' | 'manifestHash'>;

async function requireReadyBody(db: DbPort, published: ReadyPublication, descriptor: CanonicalBlob) {
  if (descriptor.role !== 1 && descriptor.role !== 5) throw new Error('framed_sync_body_descriptor_invalid');
  const [transfer] = await db.query<DbRow>(`SELECT * FROM framed_sync_inbound_transfers
    WHERE transfer_id = ?`, [published.transferId]);
  if (!transfer || transfer.state !== 'ready_to_apply') throw new Error('framed_sync_transfer_not_ready');
  const context = readFramedSyncContext(transfer);
  if (transfer.protocol_version !== published.context.protocolVersion || Object.entries(context).some(([key, value]) => published.context[key as keyof typeof context] !== value)) {
    throw new Error('framed_sync_transfer_context_mismatch');
  }
  const header = readFramedSyncHeader(transfer);
  const blob = header.blobs.find((item) => sameFramedSyncBytes(item.sha256, descriptor.sha256));
  if (!sameFramedSyncBytes(header.published.contentId, published.contentId) ||
      !sameFramedSyncBytes(header.published.manifestHash, published.manifestHash) || !blob ||
      blob.byteLength !== descriptor.byteLength || blob.role !== descriptor.role || blob.required !== descriptor.required) {
    throw new Error('framed_sync_body_header_mismatch');
  }
  const [pin] = await db.query<DbRow>(`SELECT pin.sha256, pin.byte_length, pin.role, pin.required,
    available.byte_length AS available_length, length(available.data) AS stored_length, typeof(available.data) AS stored_type
    FROM framed_sync_blob_pins pin JOIN framed_sync_available_blobs available ON available.sha256 = pin.sha256
    WHERE pin.transfer_id = ? AND pin.sha256 = ?`, [published.transferId, descriptor.sha256]);
  if (!pin || !sameFramedSyncBytes(framedSyncBytes(pin, 'sha256'), descriptor.sha256) ||
      framedSyncBigInt(pin, 'byte_length') !== descriptor.byteLength || pin.role !== descriptor.role ||
      pin.required !== Number(descriptor.required) || framedSyncBigInt(pin, 'available_length') !== descriptor.byteLength ||
      framedSyncBigInt(pin, 'stored_length') !== descriptor.byteLength || pin.stored_type !== 'blob') {
    throw new Error('framed_sync_body_pin_mismatch');
  }
}

/** Caller retains the durable ready transfer until its enclosing business transaction commits. */
export async function adoptDesktopStagedBody(db: DbPort, published: ReadyPublication, descriptor: CanonicalBlob, now: string) {
  const identity = bodyIdentity.parse({ hash: bytesToHex(descriptor.sha256), byteLength: Number(descriptor.byteLength) });
  await requireReadyBody(db, published, descriptor);
  return adoptFramedSyncAvailableBody(db, 'framed_sync_available_blobs', identity, now);
}
