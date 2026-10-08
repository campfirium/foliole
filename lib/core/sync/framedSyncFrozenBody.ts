import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, isBytes } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';

export function validateFramedSyncFrozenBody(blob: Pick<CanonicalBlob, 'sha256' | 'byteLength'>,
  data: Uint8Array) {
  if (!isBytes(data) || BigInt(data.byteLength) !== blob.byteLength ||
      bytesToHex(sha256(data)) !== bytesToHex(blob.sha256)) {
    throw new Error('framed_sync_published_body_unavailable');
  }
  return data;
}

/** Caller owns the transaction that publishes the corresponding frozen input and hold. */
export async function stageFramedSyncFrozenBody(db: DbPort, blob: CanonicalBlob, data: Uint8Array) {
  validateFramedSyncFrozenBody(blob, data);
  const [prior] = await db.query<{ byte_length: number; data: Uint8Array }>(
    'SELECT byte_length, data FROM framed_sync_available_blobs WHERE sha256 = ?', [blob.sha256]);
  if (prior) {
    if (BigInt(prior.byte_length) !== blob.byteLength) throw new Error('framed_sync_published_body_unavailable');
    validateFramedSyncFrozenBody(blob, prior.data);
    return;
  }
  await db.run('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)',
    [blob.sha256, blob.byteLength, data]);
}

export async function loadFramedSyncFrozenBody(db: DbPort, blob: CanonicalBlob) {
  const [row] = await db.query<{ byte_length: number; data: Uint8Array }>(
    'SELECT byte_length, data FROM framed_sync_available_blobs WHERE sha256 = ?', [blob.sha256]);
  if (!row || BigInt(row.byte_length) !== blob.byteLength) throw new Error('framed_sync_published_body_unavailable');
  return validateFramedSyncFrozenBody(blob, row.data);
}

export const UNOWNED_FRAMED_BODY = `NOT EXISTS (SELECT 1 FROM framed_sync_blob_pins pin
  WHERE pin.sha256 = framed_sync_available_blobs.sha256) AND NOT EXISTS (
  SELECT 1 FROM framed_sync_outbound_blob_refs ref JOIN framed_sync_outbound_holds owner
    ON owner.transfer_id = ref.transfer_id WHERE ref.sha256 = framed_sync_available_blobs.sha256)`;

/** Caller releases the owner's holds before retiring its now unowned temporary bytes. */
export async function retireFramedSyncFrozenBodies(db: DbPort, transferId: Uint8Array) {
  await db.run(`DELETE FROM framed_sync_available_blobs WHERE sha256 IN (
    SELECT sha256 FROM framed_sync_outbound_blob_refs WHERE transfer_id = ?) AND ${UNOWNED_FRAMED_BODY}`,
  [transferId]);
}
