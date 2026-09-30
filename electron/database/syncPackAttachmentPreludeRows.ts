import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

interface AttachmentStateRow extends DatabaseRow {
  object_type: string;
  object_id: string;
  state_seq: number;
  content_hash: string;
  last_modified_by_host_name: string;
  updated_at: string;
  deleted_at: string | null;
}

export function loadAttachmentPreludeStateRows(driver: DatabaseDriver, args: {
  fromStateSeq: number;
  pageStateRows: Array<{ object_type: string; object_id: string; deleted_at: string | null }>;
  nodeAttachments: Array<{ attachment_id: string }>;
}) {
  const attachmentIds = [...new Set([
    ...args.pageStateRows.filter((row) => row.object_type === 'pdf_page_text' && !row.deleted_at)
      .map((row) => row.object_id.slice(0, row.object_id.lastIndexOf(':'))),
    ...args.nodeAttachments.map((row) => row.attachment_id)
  ].filter(Boolean))];
  if (attachmentIds.length === 0) return [];
  return driver.queryAll<AttachmentStateRow>(
    `SELECT state.object_type, state.object_id, state.state_seq, state.content_hash,
       state.last_modified_by_host_name, state.updated_at, state.deleted_at
     FROM sync_object_state state JOIN attachments attachment ON attachment.id = state.object_id
     WHERE state.object_type = 'attachment' AND state.deleted_at IS NULL
       AND state.state_seq > ?
       AND state.object_id IN (${attachmentIds.map(() => '?').join(', ')})
     ORDER BY state.state_seq ASC`, [args.fromStateSeq, ...attachmentIds]
  );
}
