import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export function digestEditorContent(content: string) {
  return bytesToHex(sha256(new TextEncoder().encode(content)));
}
