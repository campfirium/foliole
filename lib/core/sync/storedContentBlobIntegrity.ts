import type { DbPort, DbRow } from './dbPort.js';
import { hashSqliteByteChunks } from './hashSqliteByteChunks.js';

export interface StoredContentBlobMeta extends DbRow {
  hash: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

/** Verify cached bytes without bringing a whole BLOB across the database bridge. */
export async function verifyStoredContentBlobBytes(port: DbPort, row: StoredContentBlobMeta) {
  if (!Number.isSafeInteger(row.stored_size_bytes) || row.stored_size_bytes < 0) return false;
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
