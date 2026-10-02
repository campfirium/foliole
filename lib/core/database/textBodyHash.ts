import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Exact UTF-8 content addressing shared by synchronous and companion hosts. */
export function hashTextBody(content: string) {
  return bytesToHex(sha256(new TextEncoder().encode(content)));
}
