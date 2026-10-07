import { BodyContentVerification } from '../sync/bodyContentVerification.js';
import { verifiedBodyRefFromHeader, type VerifiedBodyRef } from '../sync/verifiedBody.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import type { DatabaseDriver } from './driver.js';

export function loadVerifiedBodyRefWithDriver(driver: DatabaseDriver, hash: string) {
  const row = driver.queryOne<{ hash: string; byte_length: number; frontmatter_end: number | null; utf16_length: number }>(
    'SELECT hash, byte_length, frontmatter_end, utf16_length FROM content_bodies WHERE hash = ? AND verified = 1', [hash]);
  return row ? verifiedBodyRefFromHeader(row) : null;
}

export function readBodyRangeWithDriver(driver: DatabaseDriver, ref: VerifiedBodyRef, offset: number, maxBytes: number) {
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
    const row = driver.queryOne<{ data: Uint8Array }>(
      'SELECT substr(data, ?, ?) AS data FROM content_body_chunks WHERE hash = ? AND byte_offset = ?',
      [position - chunkOffset + 1, limit, ref.hash, chunkOffset]);
    if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== limit) throw new Error('body_content_unavailable');
    result.set(row.data, written);
    written += limit;
  }
  return result;
}

/** Single-article editor and independent background indexing only. Ordinary sync uses the range reader. */
export function readBodyTextWithDriver(driver: DatabaseDriver, ref: VerifiedBodyRef) {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let text = '';
  for (let offset = 0; offset < ref.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    text += decoder.decode(readBodyRangeWithDriver(driver, ref, offset, BODY_CONTENT_CHUNK_BYTES), { stream: true });
  }
  return text + decoder.decode();
}

export function verifyBodyContentWithDriver(driver: DatabaseDriver, identity: { hash: string; byteLength: number }) {
  const verification = new BodyContentVerification(identity);
  try {
    for (;;) {
      const row = driver.queryOne<{ byte_offset: number; data: Uint8Array }>(`SELECT byte_offset, data
        FROM content_body_chunks WHERE hash = ? AND byte_offset >= ? ORDER BY byte_offset LIMIT 1`,
      [verification.identity.hash, verification.offset]);
      if (!row) break;
      verification.push(row.byte_offset, row.data);
    }
    const result = verification.finish();
    const updated = driver.execute(`UPDATE content_bodies SET verified = 1, frontmatter_end = ?, utf16_length = ?
      WHERE hash = ? AND byte_length = ?`, [result.frontmatterEnd, result.utf16Length, result.hash, result.byteLength]);
    if (updated.changes !== 1) throw new Error('body_identity_missing');
    return verifiedBodyRefFromHeader({ hash: result.hash, byte_length: result.byteLength,
      frontmatter_end: result.frontmatterEnd, utf16_length: result.utf16Length });
  } finally { verification.destroy(); }
}
