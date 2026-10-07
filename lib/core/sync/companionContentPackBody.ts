import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import { adoptVerifiedBody, stageBodyContent } from './bodyContentWrite.js';
import type { DbPort } from './dbPort.js';

/** The caller owns the attached pack and the business transaction through adoption. */
export async function adoptCompanionContentPackBodies(db: DbPort, hashes: readonly string[], now: string) {
  for (const hash of hashes) {
    const [row] = await db.query<{ size_bytes: number }>(
      'SELECT size_bytes FROM content_batch.content_blob_batch WHERE hash = ?', [hash]);
    if (!row) throw new Error('body_content_unavailable');
    const ref = await stageBodyContent(db, {
      hash, byteLength: row.size_bytes, chunks: packBodyChunks(db, hash, row.size_bytes)
    });
    await adoptVerifiedBody(db, ref, now);
  }
}

async function* packBodyChunks(db: DbPort, hash: string, length: number) {
  for (let offset = 0; offset < length; offset += BODY_CONTENT_CHUNK_BYTES) {
    const size = Math.min(BODY_CONTENT_CHUNK_BYTES, length - offset);
    const [row] = await db.query<{ data: Uint8Array }>(
      'SELECT substr(data, ?, ?) AS data FROM content_batch.content_blob_batch WHERE hash = ?',
      [offset + 1, size, hash]);
    if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== size) {
      throw new Error('body_content_unavailable');
    }
    yield row.data;
  }
}
