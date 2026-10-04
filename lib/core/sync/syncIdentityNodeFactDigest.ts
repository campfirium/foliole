import { sha256 } from '@noble/hashes/sha2.js';

const encoder = new TextEncoder();

export function addSyncIdentityNodeFactDigest(hash: ReturnType<typeof sha256.create>, kind: string, fact: unknown) {
  const bytes = encoder.encode(JSON.stringify([kind, fact]));
  hash.update(encoder.encode(`${bytes.length}:`));
  hash.update(bytes);
}
