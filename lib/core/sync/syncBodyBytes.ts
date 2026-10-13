import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, isBytes } from '@noble/hashes/utils.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';

export function validateSyncBodyBytes(blob: Pick<CanonicalBlob, 'sha256' | 'byteLength'>,
  data: Uint8Array) {
  if (!isBytes(data) || BigInt(data.byteLength) !== blob.byteLength ||
      bytesToHex(sha256(data)) !== bytesToHex(blob.sha256)) {
    throw new Error('framed_sync_published_body_unavailable');
  }
  return data;
}
