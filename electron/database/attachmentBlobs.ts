import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export interface AttachmentBlobManifestInput {
  attachmentId: string;
  contentHash: string | null;
  storageKey: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  availability: string;
  sourceHostName: string | null;
  createdAt: string;
  cachedAt?: string | null;
  lastVerifiedAt?: string | null;
}

export type AttachmentBlobManifest = Required<AttachmentBlobManifestInput>;

interface AttachmentBlobManifestRow extends DatabaseRow {
  attachment_id: string;
  content_hash: string | null;
  storage_key: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  availability: string;
  source_host_name: string | null;
  created_at: string;
  cached_at: string | null;
  last_verified_at: string | null;
}

interface AttachmentSyncRow extends DatabaseRow {
  created_at: string;
  mime_type: string | null;
  original_name: string | null;
  size_bytes: number | null;
}

function toAttachmentBlobManifest(row: AttachmentBlobManifestRow): AttachmentBlobManifest {
  return {
    attachmentId: row.attachment_id,
    contentHash: row.content_hash,
    storageKey: row.storage_key,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    availability: row.availability,
    sourceHostName: row.source_host_name,
    createdAt: row.created_at,
    cachedAt: row.cached_at,
    lastVerifiedAt: row.last_verified_at
  };
}

function readAttachmentSyncRow(driver: DatabaseDriver, attachmentId: string) {
  return driver.queryOne<AttachmentSyncRow>(
    `SELECT original_name, mime_type, size_bytes, created_at
     FROM attachments
     WHERE id = ?`,
    [attachmentId]
  ) ?? null;
}

export function upsertAttachmentBlobManifest(input: AttachmentBlobManifestInput): void {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO attachment_blobs (
       attachment_id,
       content_hash,
       storage_key,
       size_bytes,
       mime_type,
       availability,
       source_host_name,
       created_at,
       cached_at,
       last_verified_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(attachment_id) DO UPDATE SET
       content_hash = excluded.content_hash,
       storage_key = excluded.storage_key,
       size_bytes = excluded.size_bytes,
       mime_type = excluded.mime_type,
       availability = excluded.availability,
       source_host_name = excluded.source_host_name,
       cached_at = excluded.cached_at,
       last_verified_at = excluded.last_verified_at`,
    [
      input.attachmentId,
      input.contentHash,
      input.storageKey,
      input.sizeBytes,
      input.mimeType,
      input.availability,
      input.sourceHostName,
      input.createdAt,
      input.cachedAt ?? null,
      input.lastVerifiedAt ?? null
    ]
  );
  recordAttachmentSyncState(connection.driver, toSyncPayload(input, readAttachmentSyncRow(connection.driver, input.attachmentId)), input.createdAt);
}

export function findAttachmentBlobManifestById(attachmentId: string): AttachmentBlobManifest | null {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<AttachmentBlobManifestRow>(
    `SELECT
       attachment_id,
       content_hash,
       storage_key,
       size_bytes,
       mime_type,
       availability,
       source_host_name,
       created_at,
       cached_at,
       last_verified_at
     FROM attachment_blobs
     WHERE attachment_id = ?`,
    [attachmentId]
  );

  return row ? toAttachmentBlobManifest(row) : null;
}

function toSyncPayload(input: AttachmentBlobManifestInput, attachment: AttachmentSyncRow | null) {
  return {
    attachment_id: input.attachmentId,
    created_at: attachment?.created_at ?? input.createdAt,
    mime_type: attachment?.mime_type ?? input.mimeType,
    original_name: attachment?.original_name ?? null,
    size_bytes: attachment?.size_bytes ?? input.sizeBytes,
    blob: {
      availability: input.availability,
      cached_at: input.cachedAt ?? null,
      content_hash: input.contentHash,
      created_at: input.createdAt,
      last_verified_at: input.lastVerifiedAt ?? null,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      source_host_name: input.sourceHostName,
      storage_key: input.storageKey
    }
  };
}

function recordAttachmentSyncState(driver: DatabaseDriver, payload: ReturnType<typeof toSyncPayload>, updatedAt: string) {
  const hostName = loadOrCreateDesktopHostName(updatedAt);
  const contentHash = computeSyncContentHash('attachment', payload);
  upsertSyncObjectState(driver, {
    objectType: 'attachment',
    objectId: payload.attachment_id,
    contentHash,
    lastModifiedByHostName: hostName,
    updatedAt,
    syncDirty: true
  });
}

export function recordAttachmentDeleted(driver: DatabaseDriver, attachmentId: string, deletedAt: string) {
  const hostName = loadOrCreateDesktopHostName(deletedAt);
  const payload = { attachment_id: attachmentId };
  const contentHash = computeSyncContentHash('attachment', { ...payload, deleted_at: deletedAt });
  upsertSyncObjectState(driver, {
    objectType: 'attachment',
    objectId: attachmentId,
    contentHash,
    lastModifiedByHostName: hostName,
    updatedAt: deletedAt,
    deletedAt,
    syncDirty: true
  });
}
