import { assertBodyManifestIdentity, bodyAdoptionStatement, BODY_MANIFEST_SQL, type BodyManifest } from '../database/bodyContentAdoption.js';
import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';
import { alignedBodyTextChunks } from '../database/bodyTextChunks.js';
import { hashTextBodyWithLength } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';
import { loadVerifiedBodyRef, verifyBodyContent, type VerifiedBodyRef } from './verifiedBody.js';

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

/** Editor/background imports may supply one complete text; storage never creates a complete byte copy. */
export async function stageTextBodyContent(db: DbPort, content: string): Promise<VerifiedBodyRef> {
  const identity = hashTextBodyWithLength(content);
  return stageBodyContent(db, { ...identity, chunks: alignedBodyTextChunks(content, identity.byteLength) });
}

/** Caller owns the transaction and the staged-content owner until adoption commits. */
export async function stageBodyContent(db: DbPort, input: {
  hash: string;
  byteLength: number;
  chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>;
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
  const statement = bodyAdoptionStatement(ref, now);
  await db.run(statement.sql, statement.params);
  const [manifest] = await db.query<BodyManifest>(BODY_MANIFEST_SQL, [ref.hash]);
  assertBodyManifestIdentity(manifest, ref);
  return ref.hash;
}
