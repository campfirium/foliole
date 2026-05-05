import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

export const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';
export const CONTENT_BLOB_BATCH_PATH = '/companion/content-blobs';
export const CONTENT_BLOB_ACK_PATH = '/companion/content-blob/ack';
const CONTENT_BLOB_BATCH_BOUNDARY_PREFIX = 'foliole-content-blobs-';

interface ContentBlobRow extends DatabaseRow {
  data: Buffer | Uint8Array | string;
  mime_type: string | null;
}

export type CompanionContentBlobResource =
  | {
      body: Buffer;
      mimeType: string | null;
      status: 'ready';
    }
  | {
      error: string;
      status: 'error';
      statusCode: number;
    };

export type CompanionContentBlobBatchResource =
  | {
      body: Buffer;
      missingHashes: string[];
      mimeType: string;
      status: 'ready';
    }
  | {
      error: string;
      status: 'error';
      statusCode: number;
    };

function normalizeHash(value: string | null) {
  const hash = value?.trim() ?? '';
  return /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
}

function normalizeAckHashes(value: unknown) {
  if (!Array.isArray(value)) return null;
  const hashes = value
    .map((hash) => (typeof hash === 'string' ? normalizeHash(hash) : null))
    .filter((hash): hash is string => Boolean(hash));
  return hashes.length === value.length ? hashes : null;
}

function toBuffer(data: ContentBlobRow['data']) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(data, 'utf8');
}

function createBatchBoundary(hashes: string[]) {
  return `${CONTENT_BLOB_BATCH_BOUNDARY_PREFIX}${hashes.join('').slice(0, 24)}`;
}

function encodeContentBlobBatch(rows: Array<ContentBlobRow & { hash: string }>, boundary: string) {
  const entries = rows.map((row) => {
    const data = toBuffer(row.data);
    return Buffer.concat([
      Buffer.from(`--${boundary}\r\n`, 'utf8'),
      Buffer.from(`Content-Type: ${row.mime_type ?? 'application/octet-stream'}\r\n`, 'utf8'),
      Buffer.from(`Content-Length: ${data.byteLength}\r\n`, 'utf8'),
      Buffer.from(`X-Blob-Hash: ${row.hash}\r\n\r\n`, 'utf8'),
      data,
      Buffer.from('\r\n', 'utf8')
    ]);
  });
  return Buffer.concat([...entries, Buffer.from(`--${boundary}--\r\n`, 'utf8')]);
}

export async function loadCompanionContentBlobResource(hashParam: string | null): Promise<CompanionContentBlobResource> {
  const hash = normalizeHash(hashParam);
  if (!hash) {
    return { error: 'invalid_hash', status: 'error', statusCode: 400 };
  }
  const row = openDatabaseConnection().driver.queryOne<ContentBlobRow>(
    `SELECT cb.mime_type, cbd.data
     FROM content_blobs cb
     JOIN content_blob_data cbd ON cbd.hash = cb.hash
     WHERE cb.hash = ?
     LIMIT 1`,
    [hash]
  );
  if (!row) {
    return { error: 'blob_not_found', status: 'error', statusCode: 404 };
  }
  return {
    body: toBuffer(row.data),
    mimeType: row.mime_type,
    status: 'ready'
  };
}

export function loadCompanionContentBlobBatch(bodyText: string): CompanionContentBlobBatchResource {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return { error: 'invalid_json', status: 'error' as const, statusCode: 400 };
  }
  const hashes = normalizeAckHashes((payload as { hashes?: unknown }).hashes);
  if (!hashes) {
    return { error: 'invalid_hashes', status: 'error' as const, statusCode: 400 };
  }
  const placeholders = hashes.map(() => '?').join(', ');
  const rows = openDatabaseConnection().driver.queryAll<ContentBlobRow & { hash: string }>(
    `SELECT cb.hash, cb.mime_type, cbd.data
     FROM content_blobs cb
     JOIN content_blob_data cbd ON cbd.hash = cb.hash
     WHERE cb.hash IN (${placeholders})`,
    hashes
  );
  const rowByHash = new Map(rows.map((row) => [row.hash, row]));
  const orderedRows = hashes.flatMap((hash) => {
    const row = rowByHash.get(hash);
    return row ? [row] : [];
  });
  const boundary = createBatchBoundary(hashes);
  return {
    body: encodeContentBlobBatch(orderedRows, boundary),
    mimeType: `multipart/mixed; boundary=${boundary}`,
    missingHashes: hashes.filter((hash) => !rowByHash.has(hash)),
    status: 'ready'
  };
}

export function acknowledgeCompanionContentBlobs(bodyText: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return { error: 'invalid_json', status: 'error' as const, statusCode: 400 };
  }
  const hashes = normalizeAckHashes((payload as { hashes?: unknown }).hashes);
  if (!hashes) {
    return { error: 'invalid_hashes', status: 'error' as const, statusCode: 400 };
  }
  return {
    acked_hashes: hashes,
    status: 'ok' as const
  };
}
