import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import { BodyFrontmatterRange } from './bodyFrontmatterRange.js';
import type { DbPort } from './dbPort.js';

const bodyIdentity = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
  byteLength: z.number().int().nonnegative().max(8 * 1024 * 1024 * 1024)
});
const verifiedBodyBrand: unique symbol = Symbol('verifiedBody');

export type VerifiedBodyRef = Readonly<z.infer<typeof bodyIdentity> & {
  [verifiedBodyBrand]: true;
  frontmatterEnd: number | null;
  utf16Length: number;
}>;

export async function loadVerifiedBodyRef(db: DbPort, hash: string): Promise<VerifiedBodyRef | null> {
  const [row] = await db.query<{ hash: string; byte_length: number; frontmatter_end: number | null; utf16_length: number }>(
    'SELECT hash, byte_length, frontmatter_end, utf16_length FROM content_bodies WHERE hash = ? AND verified = 1', [hash]);
  if (!row) return null;
  const frontmatterEnd = z.number().int().nonnegative().max(row.byte_length).nullable().parse(row.frontmatter_end);
  const utf16Length = z.number().int().nonnegative().max(row.byte_length).parse(row.utf16_length);
  return { ...bodyIdentity.parse({ hash: row.hash, byteLength: row.byte_length }),
    frontmatterEnd, utf16Length, [verifiedBodyBrand]: true };
}

export async function readBodyRange(
  db: DbPort, ref: VerifiedBodyRef, offset: number, maxBytes: number
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > ref.byteLength ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > BODY_CONTENT_CHUNK_BYTES) {
    throw new Error('body_range_invalid');
  }
  const size = Math.min(maxBytes, ref.byteLength - offset);
  const result = new Uint8Array(size);
  let written = 0;
  while (written < size) {
    const position = offset + written;
    const chunkOffset = position - position % BODY_CONTENT_CHUNK_BYTES;
    const limit = Math.min(size - written, BODY_CONTENT_CHUNK_BYTES - (position - chunkOffset));
    const [row] = await db.query<{ data: Uint8Array }>(
      'SELECT substr(data, ?, ?) AS data FROM content_body_chunks WHERE hash = ? AND byte_offset = ?',
      [position - chunkOffset + 1, limit, ref.hash, chunkOffset]);
    if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== limit) {
      throw new Error('body_content_unavailable');
    }
    result.set(row.data, written);
    written += limit;
  }
  return result;
}

export async function* streamBodyBytes(db: DbPort, ref: VerifiedBodyRef) {
  for (let offset = 0; offset < ref.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    yield await readBodyRange(db, ref, offset, BODY_CONTENT_CHUNK_BYTES);
  }
}

/** Caller must retain the durable owner while this iterator is consumed. */
export async function* streamBodyText(db: DbPort, ref: VerifiedBodyRef) {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  for await (const bytes of streamBodyBytes(db, ref)) yield decoder.decode(bytes, { stream: true });
  const tail = decoder.decode();
  if (tail) yield tail;
}

/** Used by the editor and the independent background index, never by ordinary sync apply. */
export async function readBodyText(db: DbPort, ref: VerifiedBodyRef) {
  let text = '';
  for await (const chunk of streamBodyText(db, ref)) text += chunk;
  return text;
}

export async function verifyBodyContent(db: DbPort, identity: z.infer<typeof bodyIdentity>): Promise<VerifiedBodyRef> {
  const value = bodyIdentity.parse(identity);
  const hash = sha256.create();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const frontmatter = new BodyFrontmatterRange();
  let offset = 0;
  let utf16Length = 0;
  try {
    for (;;) {
      const [row] = await db.query<{ byte_offset: number; data: Uint8Array }>(
        `SELECT byte_offset, data FROM content_body_chunks
         WHERE hash = ? AND byte_offset >= ? ORDER BY byte_offset LIMIT 1`, [value.hash, offset]);
      if (!row) break;
      const expected = Math.min(BODY_CONTENT_CHUNK_BYTES, value.byteLength - offset);
      if (row.byte_offset !== offset || !(row.data instanceof Uint8Array) ||
          expected < 1 || row.data.byteLength !== expected) throw new Error('body_coverage_incomplete');
      hash.update(row.data);
      utf16Length += decoder.decode(row.data, { stream: true }).length;
      frontmatter.push(row.data);
      offset += row.data.byteLength;
    }
    utf16Length += decoder.decode().length;
    if (offset !== value.byteLength) throw new Error('body_coverage_incomplete');
    if (bytesToHex(hash.digest()) !== value.hash) throw new Error('body_hash_mismatch');
    const frontmatterEnd = frontmatter.finish();
    const result = await db.run(`UPDATE content_bodies SET verified = 1, frontmatter_end = ?, utf16_length = ?
      WHERE hash = ? AND byte_length = ?`, [frontmatterEnd, utf16Length, value.hash, value.byteLength]);
    if (result.changes !== 1) throw new Error('body_identity_missing');
    return { ...value, frontmatterEnd, utf16Length, [verifiedBodyBrand]: true };
  } finally {
    hash.destroy();
  }
}
