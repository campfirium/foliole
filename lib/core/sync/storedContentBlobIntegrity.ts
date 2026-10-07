import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { assertBodyManifestIdentity, BODY_MANIFEST_SQL, type BodyManifest } from '../database/bodyContentAdoption.js';
import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import type { DbPort, DbRow } from './dbPort.js';
import { hashSqliteByteChunks } from './hashSqliteByteChunks.js';
import type { NodeVersionBodyStorage } from './syncNodeTombstoneVersion.js';
import { verifiedBodyRefFromHeader } from './verifiedBody.js';

export interface StoredContentBlobMeta extends DbRow {
  hash: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

/** Verify cached bytes without bringing a whole BLOB across the database bridge. */
export async function verifyStoredContentBlobBytes(
  port: DbPort, row: StoredContentBlobMeta, bodyStorage: NodeVersionBodyStorage = 'continuous'
) {
  if (!Number.isSafeInteger(row.stored_size_bytes) || row.stored_size_bytes < 0) return false;
  if (bodyStorage === 'chunked') return verifyChunkedStoredBody(port, row);
  const [stored] = await port.query<{ byte_length: number }>(
    'SELECT length(CAST(data AS BLOB)) AS byte_length FROM content_blob_data WHERE hash = ?', [row.hash]);
  if (!stored || stored.byte_length !== row.stored_size_bytes) return false;
  const hash = await hashSqliteByteChunks(row.stored_size_bytes, async (offset, limit) => {
    const [chunk] = await port.query<{ chunk_hex: string }>(
      'SELECT hex(substr(CAST(data AS BLOB), ?, ?)) AS chunk_hex FROM content_blob_data WHERE hash = ?',
      [offset + 1, limit, row.hash]);
    return chunk?.chunk_hex ?? '';
  });
  return hash === row.stored_sha256;
}

async function verifyChunkedStoredBody(port: DbPort, row: StoredContentBlobMeta) {
  const [header] = await port.query<{
    hash: string; byte_length: number; frontmatter_end: number | null; utf16_length: number;
  }>('SELECT hash, byte_length, frontmatter_end, utf16_length FROM content_bodies WHERE hash = ? AND verified = 1', [row.hash]);
  if (!header) return false;
  const [manifest] = await port.query<BodyManifest>(BODY_MANIFEST_SQL, [row.hash]);
  try {
    const ref = verifiedBodyRefFromHeader(header);
    assertBodyManifestIdentity(manifest, ref);
    if (ref.hash !== row.stored_sha256 || ref.byteLength !== row.stored_size_bytes) return false;
  } catch { return false; }
  return verifyChunkedRawBytes(port, row);
}

async function verifyChunkedRawBytes(port: DbPort, row: StoredContentBlobMeta) {
  const digest = sha256.create();
  let offset = 0;
  try {
    for (;;) {
      const [chunk] = await port.query<{ byte_offset: number; data: Uint8Array }>(
        `SELECT byte_offset, data FROM content_body_chunks WHERE hash = ? AND byte_offset >= ?
          ORDER BY byte_offset LIMIT 1`, [row.hash, offset]);
      if (!chunk) break;
      const length = Math.min(BODY_CONTENT_CHUNK_BYTES, row.stored_size_bytes - offset);
      if (chunk.byte_offset !== offset || !(chunk.data instanceof Uint8Array) ||
          length < 1 || chunk.data.byteLength !== length) return false;
      digest.update(chunk.data);
      offset += chunk.data.byteLength;
    }
    return offset === row.stored_size_bytes && bytesToHex(digest.digest()) === row.stored_sha256;
  } finally { digest.destroy(); }
}
