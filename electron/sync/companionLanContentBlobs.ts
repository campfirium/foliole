import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { openDatabaseConnection } from '../database/connection.js';

export const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';
export const CONTENT_BLOB_ACK_PATH = '/companion/content-blob/ack';

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
