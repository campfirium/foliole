import { bodyIdentity } from '../sync/bodyContentVerification.js';
import type { VerifiedBodyRef } from '../sync/verifiedBody.js';

import { assertBodyManifestIdentity, bodyAdoptionStatement, BODY_MANIFEST_SQL, type BodyManifest } from './bodyContentAdoption.js';
import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import { alignedBodyTextChunks } from './bodyTextChunks.js';
import type { DatabaseDriver } from './driver.js';
import { hashTextBodyWithLength } from './textBodyHash.js';
import { loadVerifiedBodyRefWithDriver, verifyBodyContentWithDriver } from './verifiedBodyWithDriver.js';

/** Editor/import callers already own one text string; no complete encoded copy is created. */
export function stageTextBodyContentWithDriver(driver: DatabaseDriver, content: string): VerifiedBodyRef {
  const identity = hashTextBodyWithLength(content);
  return stageBodyContentWithDriver(driver, { ...identity, chunks: alignedBodyTextChunks(content, identity.byteLength) });
}

/** The caller retains the staging owner and owns the enclosing transaction. */
export function stageBodyContentWithDriver(driver: DatabaseDriver, input: {
  hash: string; byteLength: number; chunks: Iterable<Uint8Array>;
}): VerifiedBodyRef {
  const identity = bodyIdentity.safeParse(input);
  if (!identity.success) throw new Error('body_identity_invalid');
  driver.execute('INSERT OR IGNORE INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
    [input.hash, input.byteLength]);
  const existing = driver.queryOne<{ byte_length: number }>(
    'SELECT byte_length FROM content_bodies WHERE hash = ?', [input.hash]);
  if (existing?.byte_length !== input.byteLength) throw new Error('body_identity_conflict');
  let offset = 0;
  for (const data of input.chunks) {
    const expected = Math.min(BODY_CONTENT_CHUNK_BYTES, input.byteLength - offset);
    if (!(data instanceof Uint8Array) || expected < 1 || data.byteLength !== expected) throw new Error('body_chunk_length_invalid');
    const chunk = driver.queryOne<{ data: Uint8Array }>(
      'SELECT data FROM content_body_chunks WHERE hash = ? AND byte_offset = ?', [input.hash, offset]);
    if (chunk) {
      if (!(chunk.data instanceof Uint8Array) || chunk.data.byteLength !== data.byteLength ||
          !chunk.data.every((byte, index) => byte === data[index])) throw new Error('body_chunk_identity_conflict');
    } else driver.execute('INSERT INTO content_body_chunks (hash, byte_offset, data) VALUES (?, ?, ?)', [input.hash, offset, data]);
    offset += data.byteLength;
  }
  if (offset !== input.byteLength) throw new Error('body_coverage_incomplete');
  return verifyBodyContentWithDriver(driver, input);
}

export function adoptVerifiedBodyWithDriver(driver: DatabaseDriver, ref: VerifiedBodyRef, now: string) {
  const stored = loadVerifiedBodyRefWithDriver(driver, ref.hash);
  if (!stored || stored.byteLength !== ref.byteLength) throw new Error('body_content_unavailable');
  const statement = bodyAdoptionStatement(ref, now);
  driver.execute(statement.sql, statement.params);
  assertBodyManifestIdentity(driver.queryOne<BodyManifest>(BODY_MANIFEST_SQL, [ref.hash]), ref);
  return ref.hash;
}
