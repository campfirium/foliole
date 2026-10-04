import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const MAXIMUM_CHUNK_BYTES = 256 * 1024;

/** Hash SQLite byte slices without returning the complete body across the storage bridge. */
export async function hashSqliteByteChunks(size: number,
  read: (offset: number, limit: number) => Promise<string>): Promise<string> {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('sqlite_byte_chunk_size_invalid');
  const hash = sha256.create();
  for (let offset = 0; offset < size;) {
    const limit = Math.min(MAXIMUM_CHUNK_BYTES, size - offset);
    const hex = await read(offset, limit);
    if (typeof hex !== 'string' || hex.length !== limit * 2 || !/^[0-9a-f]*$/iu.test(hex)) {
      throw new Error('sqlite_byte_chunk_invalid');
    }
    hash.update(hexToBytes(hex));
    offset += limit;
  }
  return bytesToHex(hash.digest());
}
