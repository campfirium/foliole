import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import type { DbPort } from './dbPort.js';
import { loadVerifiedBodyRef, verifyBodyContent, type VerifiedBodyRef } from './verifiedBody.js';

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

/** Caller owns the transaction and the staged-content owner until adoption commits. */
export async function stageBodyContent(db: DbPort, input: {
  hash: string;
  byteLength: number;
  chunks: AsyncIterable<Uint8Array>;
}): Promise<VerifiedBodyRef> {
  if (!/^[a-f0-9]{64}$/u.test(input.hash) || !Number.isSafeInteger(input.byteLength) ||
      input.byteLength < 0 || input.byteLength > 8 * 1024 * 1024 * 1024) {
    throw new Error('body_identity_invalid');
  }
  await db.run('INSERT OR IGNORE INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
    [input.hash, input.byteLength]);
  const [existing] = await db.query<{ byte_length: number }>(
    'SELECT byte_length FROM content_bodies WHERE hash = ?', [input.hash]);
  if (existing?.byte_length !== input.byteLength) throw new Error('body_identity_conflict');
  let offset = 0;
  for await (const data of input.chunks) {
    const expected = Math.min(BODY_CONTENT_CHUNK_BYTES, input.byteLength - offset);
    if (expected < 1 || data.byteLength !== expected) throw new Error('body_chunk_length_invalid');
    const [chunk] = await db.query<{ data: Uint8Array }>(
      'SELECT data FROM content_body_chunks WHERE hash = ? AND byte_offset = ?', [input.hash, offset]);
    if (chunk) {
      if (!(chunk.data instanceof Uint8Array) || !sameBytes(chunk.data, data)) throw new Error('body_chunk_identity_conflict');
    } else {
      await db.run('INSERT INTO content_body_chunks (hash, byte_offset, data) VALUES (?, ?, ?)',
        [input.hash, offset, data]);
    }
    offset += data.byteLength;
  }
  if (offset !== input.byteLength) throw new Error('body_coverage_incomplete');
  return verifyBodyContent(db, input);
}

/** Adopt the verified stable content in the same transaction as node/version references. */
export async function adoptVerifiedBody(db: DbPort, ref: VerifiedBodyRef, now: string) {
  const stored = await loadVerifiedBodyRef(db, ref.hash);
  if (!stored || stored.byteLength !== ref.byteLength) throw new Error('body_content_unavailable');
  await db.run(`INSERT INTO content_blobs (
      hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
      original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
    ) VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
    ON CONFLICT(hash) DO NOTHING`,
  [ref.hash, `text/${ref.hash}`, ref.byteLength, ref.byteLength, ref.hash, ref.hash, now, now, now]);
  const [manifest] = await db.query<{ original_sha256: string; stored_sha256: string;
    original_size_bytes: number; stored_size_bytes: number; compression: string }>(
    `SELECT original_sha256, stored_sha256, original_size_bytes, stored_size_bytes, compression
     FROM content_blobs WHERE hash = ?`, [ref.hash]);
  if (!manifest || manifest.original_sha256 !== ref.hash || manifest.stored_sha256 !== ref.hash ||
      manifest.original_size_bytes !== ref.byteLength || manifest.stored_size_bytes !== ref.byteLength ||
      manifest.compression !== 'none') throw new Error('body_manifest_identity_conflict');
  return ref.hash;
}
