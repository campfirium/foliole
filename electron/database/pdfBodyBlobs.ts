import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { PDF_READER_PLACEHOLDER_TEXT, resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';

import { openDatabaseConnection } from './connection.js';
import type { PdfPageTextInput } from './pdfPageTextRows.js';

interface PdfReferenceNodeRow extends DatabaseRow {
  anchor_link: string | null;
  created_at: string;
  deleted_at: string | null;
  desired_retention: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  kind: string;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  title: string;
  virtual_filter: string | null;
}

interface NodeAttachmentRefRow extends DatabaseRow {
  attachment_id: string;
  role: string;
}

function buildPdfBodyContent(title: string, pages: PdfPageTextInput[]) {
  const text = [...pages]
    .sort((left, right) => left.page - right.page)
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join('\n\n');
  return text ? `# ${title.trim() || 'Untitled'}\n\n${text}` : '';
}

function listPdfReferenceNodes(attachmentId: string) {
  return openDatabaseConnection().driver.queryAll<PdfReferenceNodeRow>(
    `SELECT
       n.id, n.parent_id, n.kind, n.priority, n.desired_retention, n.title, n.is_title_manual,
       n.hide_title_heading, n.virtual_filter, n.reveal, n.anchor_link, n.image_regions, n.position,
       n.created_at, n.deleted_at
     FROM nodes n
     INNER JOIN node_attachments na ON na.node_id = n.id AND na.role = 'reference'
     WHERE na.attachment_id = ?
       AND n.deleted_at IS NULL
       AND n.content LIKE ?`,
    [attachmentId, `%${PDF_READER_PLACEHOLDER_TEXT}%`]
  );
}

function listNodeAttachmentRefs(nodeId: string) {
  return openDatabaseConnection().driver.queryAll<NodeAttachmentRefRow>(
    `SELECT attachment_id, role
     FROM node_attachments
     WHERE node_id = ?
     ORDER BY attachment_id ASC, role ASC`,
    [nodeId]
  );
}

function upsertNodePackState(node: PdfReferenceNodeRow, bodyContent: string, openingText: string | null, deviceId: string, now: string) {
  const connection = openDatabaseConnection();
  const contentHash = computeNodeSyncHash({
    anchorLink: node.anchor_link,
    attachments: listNodeAttachmentRefs(node.id).map((attachment) => ({
      attachmentId: attachment.attachment_id,
      role: attachment.role
    })),
    content: bodyContent,
    createdAt: node.created_at,
    deletedAt: node.deleted_at,
    desiredRetention: node.desired_retention,
    enableShortTerm: null,
    hideTitleHeading: node.hide_title_heading === 1,
    id: node.id,
    imageRegions: node.image_regions,
    isTitleManual: node.is_title_manual === 1,
    kind: node.kind,
    openingText,
    parentId: node.parent_id,
    position: node.position,
    priority: node.priority,
    reveal: node.reveal,
    title: node.title,
    updatedAt: now,
    virtualFilter: node.virtual_filter
  });
  const nextSeq = connection.driver.queryOne<{ value: number }>(
    'SELECT COALESCE(MAX(state_seq), 0) + 1 AS value FROM sync_object_state'
  )?.value ?? 1;
  connection.driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', ?, ?, ?, ?, ?, 1)
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       state_seq = excluded.state_seq,
       content_hash = excluded.content_hash,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       updated_at = excluded.updated_at,
       deleted_at = NULL,
       sync_dirty = 1`,
    [node.id, nextSeq, contentHash, deviceId, now]
  );
}

export function syncPdfBodyBlobsForReferenceNodes(
  attachmentId: string,
  pages: PdfPageTextInput[],
  deviceId: string,
  now: string
) {
  const nodes = listPdfReferenceNodes(attachmentId);
  for (const node of nodes) {
    const bodyContent = buildPdfBodyContent(node.title, pages);
    if (!bodyContent) {
      continue;
    }
    const bodyBlobHash = upsertTextBodyBlob(openDatabaseConnection().driver, bodyContent, now);
    const openingText = resolveNodeOpeningText(bodyContent, node.title);
    openDatabaseConnection().driver.execute(
      `UPDATE nodes
       SET body_blob_hash = ?, opening_text = ?, updated_at = ?,
           last_modified_by_device_id = ?, sync_dirty = 1
       WHERE id = ?`,
      [bodyBlobHash, openingText, now, deviceId, node.id]
    );
    upsertNodePackState(node, bodyContent, openingText, deviceId, now);
  }
}
