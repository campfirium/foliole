import { CANONICAL_EXTENSION_BY_MIME } from '../../platform/attachmentResource.js';

export function attachmentStorageKeySql(id: string, mime: string) {
  const extensions = Object.entries(CANONICAL_EXTENSION_BY_MIME)
    .map(([type, extension]) => `WHEN '${type}' THEN '${extension}'`).join(' ');
  return `(CASE WHEN length(${id}) = 64 AND ${id} NOT GLOB '*[^a-f0-9]*'
    THEN ${id} || (CASE lower(trim(${mime})) ${extensions} END) END)`;
}

/** Historical registry migration only; current sync objects have no attachment payload. */
export const LEGACY_ATTACHMENT_PAYLOAD_SQL = `SELECT json_object('attachment_id', id, 'original_name', original_name,
  'mime_type', mime_type, 'size_bytes', size_bytes, 'created_at', created_at) AS payload_json
  FROM attachments WHERE id = ?`;
