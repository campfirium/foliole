import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { utf8BodyTextChunks } from './bodyTextChunks.js';

/** Exact UTF-8 content addressing shared by synchronous and companion hosts. */
export function hashTextBody(content: string) {
  return hashTextBodyWithLength(content).hash;
}

export function hashTextBodyWithLength(content: string) {
  const digest = sha256.create();
  let byteLength = 0;
  try {
    for (const bytes of utf8BodyTextChunks(content)) {
      digest.update(bytes);
      byteLength += bytes.byteLength;
    }
    return { hash: bytesToHex(digest.digest()), byteLength };
  } finally { digest.destroy(); }
}
