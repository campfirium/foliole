import { createHash } from 'node:crypto';

import { BODY_CONTENT_CHUNK_BYTES } from '../../lib/core/database/bodyContentSchema.js';
import { availableBlobTables } from '../../lib/core/database/framedSyncAvailableBlobScope.js';
import { verifyAvailableBlobChunks } from '../../lib/core/database/framedSyncAvailableBlobVerification.js';
import { framedSyncBigInt, sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { assertBlobDescriptor, type BlobDescriptor } from '../../lib/core/sync/framedSyncBlobContract.js';

const tables = availableBlobTables('desktop');

async function receivingChunk(db: DbPort, transferId: Uint8Array, attemptId: Uint8Array,
  descriptor: BlobDescriptor, offset: number, lastStart: number | null) {
  const [row] = await db.query<DbRow>(`SELECT byte_offset, length(data) AS size, typeof(data) AS stored_type,
    substr(data, 1, ?) AS data FROM framed_sync_blob_chunks
    WHERE transfer_id = ? AND attempt_id = ? AND sha256 = ? AND (? IS NULL OR byte_offset > ?)
    ORDER BY byte_offset LIMIT 1`, [BODY_CONTENT_CHUNK_BYTES, transferId, attemptId, descriptor.sha256, lastStart, lastStart]);
  if (!row) return null;
  const size = Number(row.size);
  if (framedSyncBigInt(row, 'byte_offset') !== BigInt(offset) || row.stored_type !== 'blob' ||
      !(row.data instanceof Uint8Array) || size < 1 || size > BODY_CONTENT_CHUNK_BYTES ||
      row.data.byteLength !== size || BigInt(offset + size) > descriptor.byteLength) {
    throw new Error('blob_coverage_incomplete');
  }
  return row.data;
}

async function copyReceivingBody(db: DbPort, transferId: Uint8Array, attemptId: Uint8Array, descriptor: BlobDescriptor) {
  const target = new Uint8Array(BODY_CONTENT_CHUNK_BYTES);
  const digest = createHash('sha256');
  let offset = 0, targetOffset = 0, filled = 0;
  let lastStart: number | null = null;
  const flush = async () => {
    await db.run(`INSERT INTO ${tables.chunks} (sha256, byte_offset, data) VALUES (?, ?, ?)`,
      [descriptor.sha256, targetOffset, target.subarray(0, filled)]);
    targetOffset += filled;
    filled = 0;
  };
  for (;;) {
    const data = await receivingChunk(db, transferId, attemptId, descriptor, offset, lastStart);
    if (!data) break;
    digest.update(data);
    let position = 0;
    while (position < data.byteLength) {
      const size = Math.min(target.byteLength - filled, data.byteLength - position);
      target.set(data.subarray(position, position + size), filled);
      filled += size;
      position += size;
      if (filled === target.byteLength) await flush();
    }
    lastStart = offset;
    offset += data.byteLength;
  }
  if (BigInt(offset) !== descriptor.byteLength) throw new Error('blob_coverage_incomplete');
  if (!sameFramedSyncBytes(new Uint8Array(digest.digest()), descriptor.sha256)) throw new Error('blob_hash_mismatch');
  if (filled > 0) await flush();
}

/** Caller owns the original verification transaction and pins only after this succeeds. */
export async function verifyDesktopFramedSyncChunkedBlob(
  db: DbPort, transferId: Uint8Array, attemptId: Uint8Array, descriptor: BlobDescriptor
) {
  assertBlobDescriptor(descriptor);
  const [available] = await db.query<DbRow>(`SELECT byte_length FROM ${tables.available} WHERE sha256 = ?`, [descriptor.sha256]);
  if (available) {
    if (framedSyncBigInt(available, 'byte_length') !== descriptor.byteLength) throw new Error('blob_available_identity_conflict');
    await verifyAvailableBlobChunks(db, 'desktop', descriptor);
    return 'identical' as const;
  }
  await db.run(`INSERT INTO ${tables.available} (sha256, byte_length) VALUES (?, ?)`, [descriptor.sha256, descriptor.byteLength]);
  await copyReceivingBody(db, transferId, attemptId, descriptor);
  await verifyAvailableBlobChunks(db, 'desktop', descriptor);
  return 'available' as const;
}
