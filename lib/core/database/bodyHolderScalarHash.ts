import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../sync/dbPort.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { holderSource, scalarPositionQuery, scalarRangeQuery, type BodyIdentity, type BodyJsonHolder,
  type ScalarHashOptions, type ScalarPosition } from './bodyHolderScalarQueries.js';

export type { BodyJsonHolder } from './bodyHolderScalarQueries.js';


async function scalarMatches(db: DbPort, source: string, field: 'value' | 'key',
  position: ScalarPosition, target: BodyIdentity) {
  const digest = sha256.create();
  try {
    for (let offset = 0; offset < target.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
      const length = Math.min(BODY_CONTENT_CHUNK_BYTES, target.byteLength - offset);
      const query = scalarRangeQuery(source, field, position, offset, length);
      const [row] = await db.query<{ data: Uint8Array }>(query.sql, query.params);
      if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== length) {
        throw new Error('body_holder_scalar_unavailable');
      }
      digest.update(row.data);
    }
    return bytesToHex(digest.digest()) === target.hash;
  } finally { digest.destroy(); }
}

async function fieldContainsBody(db: DbPort, source: string, field: 'value' | 'key', target: BodyIdentity) {
  let afterRow: number | null = null;
  let afterScalar = 0;
  for (;;) {
    const query = scalarPositionQuery(source, field, target.byteLength, afterRow, afterScalar);
    const [position]: ScalarPosition[] = await db.query<ScalarPosition>(query.sql, query.params);
    if (!position) return false;
    if (await scalarMatches(db, source, field, position, target)) return true;
    afterRow = position.holder_rowid;
    afterScalar = position.scalar_id;
  }
}

/** Call inside the owner's transaction. Only scalar ranges cross the database boundary. */
export async function bodyJsonHolderContainsBody(db: DbPort, holder: BodyJsonHolder, target: BodyIdentity,
  options: ScalarHashOptions = {}) {
  const source = holderSource(holder, options);
  return await fieldContainsBody(db, source, 'value', target) ||
    await fieldContainsBody(db, source, 'key', target);
}
