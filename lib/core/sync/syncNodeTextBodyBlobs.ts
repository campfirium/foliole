import type { DbPort } from './dbPort.js';
import type { ApplySyncNodesWithDbPortOptions } from './syncNodeApplyExecutor.js';

function textBodyBlobBytes(content: string) {
  return new TextEncoder().encode(content);
}

async function hashTextBody(content: string, options: ApplySyncNodesWithDbPortOptions) {
  if (options.hashTextBody) {
    return options.hashTextBody(content);
  }
  const digest = await globalThis.crypto?.subtle.digest('SHA-256', textBodyBlobBytes(content));
  if (!digest) {
    throw new Error('sync_text_body_hash_unavailable');
  }
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function upsertTextBodyBlob(
  port: DbPort,
  content: string,
  now: string,
  options: ApplySyncNodesWithDbPortOptions
) {
  const hash = await hashTextBody(content, options);
  const size = textBodyBlobBytes(content).byteLength;
  await port.run(
    `INSERT INTO content_blobs (
       hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
     ON CONFLICT(hash) DO NOTHING`,
    [hash, `text/${hash}`, size, size, hash, hash, now, now, now]
  );
  await port.run(
    `INSERT INTO content_blob_data (hash, data)
     VALUES (?, ?)
     ON CONFLICT(hash) DO NOTHING`,
    [hash, textBodyBlobBytes(content)]
  );
  return hash;
}
