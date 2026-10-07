import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';

export interface TextBodyHashOptions {
  hashTextBody?: (content: string) => Promise<string> | string;
}

function textBodyBlobBytes(content: string) {
  return new TextEncoder().encode(content);
}

export async function hashTextBodyContent(content: string, options: TextBodyHashOptions) {
  if (options.hashTextBody) {
    return options.hashTextBody(content);
  }
  return hashTextBody(content);
}

export async function upsertTextBodyBlob(
  port: DbPort,
  content: string,
  now: string,
  hash: string
) {
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
