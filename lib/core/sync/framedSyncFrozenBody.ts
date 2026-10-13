import type { DbPort } from './dbPort.js';
import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { validateSyncBodyBytes } from './syncBodyBytes.js';

/** Caller owns the transaction that publishes the corresponding frozen input and hold. */
export async function stageFramedSyncFrozenBody(db: DbPort, blob: CanonicalBlob, data: Uint8Array) {
  validateSyncBodyBytes(blob, data);
  const prior = await readFrozenBody(db, blob);
  if (prior !== undefined) {
    validateSyncBodyBytes(blob, prior);
    return;
  }
  await db.run('INSERT INTO framed_sync_available_blobs VALUES (?, ?, ?)',
    [blob.sha256, blob.byteLength, data]);
}

export async function loadFramedSyncFrozenBody(db: DbPort, blob: CanonicalBlob) {
  const data = await readFrozenBody(db, blob);
  if (data === undefined) throw new Error('framed_sync_published_body_unavailable');
  return validateSyncBodyBytes(blob, data);
}

async function readFrozenBody(db: DbPort, blob: CanonicalBlob) {
  const [row] = await db.query<{ byte_length: number; data: Uint8Array | null;
    data_type: string; actual_byte_length: number | null }>(
    `SELECT byte_length, data, typeof(data) AS data_type, length(data) AS actual_byte_length
     FROM framed_sync_available_blobs WHERE sha256 = ?`, [blob.sha256]);
  if (!row) return undefined;
  if (BigInt(row.byte_length) !== blob.byteLength) throw new Error('framed_sync_published_body_unavailable');
  // iOS SQLite exposes a genuine zero-length BLOB pointer as JSON null.
  if (row.data === null && blob.byteLength === 0n && row.data_type === 'blob' && row.actual_byte_length === 0) {
    return new Uint8Array();
  }
  if (row.data === null) throw new Error('framed_sync_published_body_unavailable');
  return row.data;
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
