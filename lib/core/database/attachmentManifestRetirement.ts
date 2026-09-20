import { buildCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

export interface RetiringAttachmentRow {
  id: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  blob_hash: string | null;
  blob_key: string | null;
  blob_mime: string | null;
  blob_size: number | null;
}

export const ATTACHMENT_RETIREMENT_ROWS_SQL = `SELECT a.id, a.mime_type, a.size_bytes,
  b.content_hash AS blob_hash, b.storage_key AS blob_key, b.mime_type AS blob_mime, b.size_bytes AS blob_size
  FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id
  UNION ALL SELECT NULL, NULL, NULL, b.content_hash, b.storage_key, b.mime_type, b.size_bytes
  FROM attachment_blobs b LEFT JOIN attachments a ON a.id = b.attachment_id WHERE a.id IS NULL`;

export function validateAttachmentManifestRetirement(rows: RetiringAttachmentRow[]) {
  return rows.map((row) => {
    const mimeType = row.mime_type ?? row.blob_mime;
    const storageKey = row.id && mimeType ? buildCanonicalAttachmentStorageKey(row.id, mimeType) : null;
    if (!storageKey || !row.id || !/^[a-f0-9]{64}$/.test(row.id) || !mimeType
      || (row.blob_hash != null && row.blob_hash !== row.id)
      || (row.blob_key != null && row.blob_key !== storageKey)
      || (row.blob_mime != null && row.blob_mime !== mimeType)
      || (row.size_bytes != null && row.blob_size != null && row.size_bytes !== row.blob_size)) {
      throw new Error(`attachment_manifest_retirement_unrepresentable:${row.id ?? 'orphan-manifest'}`);
    }
    return { id: row.id, mimeType, sizeBytes: row.size_bytes ?? row.blob_size };
  });
}
