import { z } from 'zod';

import { syncIdentityFactChunkSchema } from './syncIdentityFactTransfer.js';

export const SYNC_IDENTITY_FACT_CHUNK_BYTES = 256 * 1024;
export const syncIdentityFactChunkPayloadSchema = syncIdentityFactChunkSchema.safeExtend({
  data_base64: z.string().min(1).max(Math.ceil(SYNC_IDENTITY_FACT_CHUNK_BYTES / 3) * 4)
});
export type SyncIdentityFactChunk = z.infer<typeof syncIdentityFactChunkSchema>;
export type SyncIdentityFactChunkPayload = z.infer<typeof syncIdentityFactChunkPayloadSchema>;

export function encodeIdentityFactChunk(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function decodeIdentityFactChunk(chunk: SyncIdentityFactChunkPayload) {
  const parsed = syncIdentityFactChunkPayloadSchema.parse(chunk);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(parsed.data_base64)) {
    throw new Error('sync_identity_fact_chunk_invalid');
  }
  const binary = atob(parsed.data_base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== Math.min(SYNC_IDENTITY_FACT_CHUNK_BYTES, parsed.total - parsed.offset) ||
      encodeIdentityFactChunk(bytes) !== parsed.data_base64) throw new Error('sync_identity_fact_chunk_invalid');
  return bytes;
}
