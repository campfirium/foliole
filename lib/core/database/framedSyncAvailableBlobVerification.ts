import { sha256 } from '@noble/hashes/sha2.js';

import type { DbPort } from '../sync/dbPort.js';
import { assertBlobDescriptor, type BlobDescriptor } from '../sync/framedSyncBlobContract.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { availableBlobTables, type AvailableBlobScope } from './framedSyncAvailableBlobScope.js';
import { sameFramedSyncBytes } from './framedSyncStagingSerialization.js';

/** Binary verification intentionally defers UTF-8 and body projections to business adoption. */
export async function verifyAvailableBlobChunks(db: DbPort, scope: AvailableBlobScope, descriptor: BlobDescriptor) {
  const tables = availableBlobTables(scope);
  assertBlobDescriptor(descriptor);
  const digest = sha256.create();
  let offset = 0;
  try {
    for (;;) {
      const [row] = await db.query<{ byte_offset: number; data: Uint8Array }>(
        `SELECT byte_offset, data FROM ${tables.chunks} WHERE sha256 = ? AND byte_offset >= ?
          ORDER BY byte_offset LIMIT 1`, [descriptor.sha256, offset]);
      if (!row) break;
      const size = Math.min(BODY_CONTENT_CHUNK_BYTES, Number(descriptor.byteLength) - offset);
      if (row.byte_offset !== offset || !(row.data instanceof Uint8Array) || size < 1 || row.data.byteLength !== size) {
        throw new Error('blob_coverage_incomplete');
      }
      digest.update(row.data);
      offset += row.data.byteLength;
    }
    if (BigInt(offset) !== descriptor.byteLength) throw new Error('blob_coverage_incomplete');
    if (!sameFramedSyncBytes(digest.digest(), descriptor.sha256)) throw new Error('blob_hash_mismatch');
  } finally { digest.destroy(); }
}
