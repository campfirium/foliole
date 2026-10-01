import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { PDF_READER_PLACEHOLDER_TEXT } from '../../lib/core/nodes/nodeOpeningPreview.js';

import { openDatabaseConnection } from './connection.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';
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
     INNER JOIN json_each(n.resource_references) resource
       ON json_extract(resource.value, '$.role') = 'reference'
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE json_extract(resource.value, '$.storage_key') = ?
       AND n.deleted_at IS NULL
       AND CASE
         WHEN n.body_blob_hash IS NULL THEN n.content
         WHEN cbd.hash IS NOT NULL THEN CAST(cbd.data AS TEXT)
         ELSE ''
       END LIKE ?`,
    [`${attachmentId}.pdf`, `%${PDF_READER_PLACEHOLDER_TEXT}%`]
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
    writeNodeBody({ content: bodyContent, driver: openDatabaseConnection().driver, nodeId: node.id, title: node.title, updatedAt: now });
    openDatabaseConnection().driver.execute(
      `UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [hostName, node.id]
    );
    flushNodeSyncVersion(node.id, now);
    updatedNodeIds.push(node.id);
  }
  return updatedNodeIds;
}
