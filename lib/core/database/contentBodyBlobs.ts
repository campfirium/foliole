import { createHash } from 'node:crypto';

import type { DatabaseDriver } from './driver.js';

export function hashTextBody(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function upsertTextBodyBlob(driver: DatabaseDriver, content: string, now: string) {
  const hash = hashTextBody(content);
  const size = Buffer.byteLength(content, 'utf8');
  driver.execute(
    `INSERT INTO content_blobs (
       hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
       original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
     ) VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
     ON CONFLICT(hash) DO NOTHING`,
    [hash, `text/${hash}`, size, size, hash, hash, now, now, now]
  );
  driver.execute(
    `INSERT INTO content_blob_data (hash, data)
     VALUES (?, ?)
     ON CONFLICT(hash) DO NOTHING`,
    [hash, Buffer.from(content, 'utf8')]
  );
  return hash;
}

export function decodeTextBodyBlobData(data: unknown) {
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return Buffer.from(new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength)).toString('utf8');
  }
  if (isArrayBuffer(data)) {
    return Buffer.from(data as ArrayBuffer).toString('utf8');
  }
  if (typeof data === 'string') {
    return data;
  }
  return null;
}

function isArrayBuffer(data: unknown) {
  return Object.prototype.toString.call(data) === '[object ArrayBuffer]';
}
