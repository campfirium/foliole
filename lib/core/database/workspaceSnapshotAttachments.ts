import type { DatabaseDriver, DatabaseRow } from './driver.js';
import type { WorkspaceNodeAttachmentSnapshot, WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

interface NodeAttachmentSnapshotRow extends DatabaseRow {
  attachment_id: string;
  mime_type: string | null;
  node_id: string;
  original_name: string | null;
  role: string;
}

function queryNodeAttachmentRows(driver: DatabaseDriver): NodeAttachmentSnapshotRow[] {
  return driver.queryAll<NodeAttachmentSnapshotRow>(
    `SELECT
       node_attachments.node_id,
       node_attachments.attachment_id,
       node_attachments.role,
       attachments.mime_type,
       attachments.original_name
     FROM node_attachments
     LEFT JOIN attachments ON attachments.id = node_attachments.attachment_id
     ORDER BY node_attachments.node_id ASC, node_attachments.role ASC, node_attachments.attachment_id ASC`
  );
}

export function attachWorkspaceNodeAttachments(
  driver: DatabaseDriver,
  nodesById: Record<string, WorkspaceNodeSnapshot>
) {
  for (const row of queryNodeAttachmentRows(driver)) {
    const node = nodesById[row.node_id];
    if (!node) {
      continue;
    }
    const attachment: WorkspaceNodeAttachmentSnapshot = {
      attachmentId: row.attachment_id,
      mimeType: row.mime_type,
      originalName: row.original_name,
      role: row.role
    };
    node.attachments = [...(node.attachments ?? []), attachment];
  }
}
