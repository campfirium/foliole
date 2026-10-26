import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { utf8BodyTextChunks } from './bodyTextChunks.js';

/** Exact UTF-8 content addressing shared by synchronous and companion hosts. */
export function hashTextBody(content: string) {
  return hashTextBodyWithLength(content).hash;
}

export async function hashTextBodyAsync(content: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('text_body_hash_unavailable');
  return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(content))));
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
