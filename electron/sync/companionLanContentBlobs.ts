import { openDatabaseConnection } from '../database/connection.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';

export const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';

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
