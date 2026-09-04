import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { PDF_READER_PLACEHOLDER_TEXT, resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';

import { openDatabaseConnection } from './connection.js';
import type { PdfPageTextInput } from './pdfPageTextRows.js';

interface PdfReferenceNodeRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  created_at: string;
  deleted_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  hide_title_heading: number;
  id: string;
  image_regions: string | null;
  import_content_fingerprint: string | null;
  import_source_fingerprint: string | null;
  is_title_manual: number;
  kind: string;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  sequential_reading_enabled: number | null;
  shelved_at: string | null;
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
       n.id, n.parent_id, n.kind, n.priority, n.desired_retention, n.enable_short_term,
       n.sequential_reading_enabled, n.shelved_at, n.title, n.is_title_manual,
       n.hide_title_heading, n.virtual_filter, n.reveal, n.anchor_link, n.image_regions,
       n.import_content_fingerprint, n.import_source_fingerprint, n.position,
       n.created_at, n.deleted_at, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n
     INNER JOIN node_attachments na ON na.node_id = n.id AND na.role = 'reference'
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE na.attachment_id = ?
       AND n.deleted_at IS NULL
       AND CASE
         WHEN n.body_blob_hash IS NULL THEN n.content
         WHEN cbd.hash IS NOT NULL THEN CAST(cbd.data AS TEXT)
         ELSE ''
       END LIKE ?`,
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

function upsertNodePackState(node: PdfReferenceNodeRow, bodyContent: string, openingText: string | null, hostName: string, now: string) {
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
    enableShortTerm: node.enable_short_term === null ? null : node.enable_short_term === 1,
    sequentialReadingEnabled: node.sequential_reading_enabled === null ? null : node.sequential_reading_enabled === 1,
    shelvedAt: node.shelved_at,
    manualChildOrder: null,
    hideTitleHeading: node.hide_title_heading === 1,
    id: node.id,
    imageRegions: node.image_regions,
    importContentFingerprint: node.import_content_fingerprint,
    importSourceFingerprint: node.import_source_fingerprint,
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
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', ?, ?, ?, ?, ?, 1)
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       state_seq = excluded.state_seq,
       content_hash = excluded.content_hash,
       last_modified_by_host_name = excluded.last_modified_by_host_name,
       updated_at = excluded.updated_at,
       deleted_at = NULL,
       sync_dirty = 1`,
    [node.id, nextSeq, contentHash, hostName, now]
  );
}

export function syncPdfBodyBlobsForReferenceNodes(
  attachmentId: string,
  pages: PdfPageTextInput[],
  hostName: string,
  now: string
) {
  const nodes = listPdfReferenceNodes(attachmentId);
  const updatedNodeIds: string[] = [];
  for (const node of nodes) {
    if (resolveNodeBody(node).status === 'unavailable') continue;
    const bodyContent = buildPdfBodyContent(node.title, pages);
    if (!bodyContent) {
      continue;
    }
    const openingText = resolveNodeOpeningText(bodyContent, node.title);
    writeNodeBody({ content: bodyContent, driver: openDatabaseConnection().driver, nodeId: node.id, title: node.title, updatedAt: now });
    openDatabaseConnection().driver.execute(
      `UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [hostName, node.id]
    );
    upsertNodePackState(node, bodyContent, openingText, hostName, now);
    updatedNodeIds.push(node.id);
  }
  return updatedNodeIds;
}
