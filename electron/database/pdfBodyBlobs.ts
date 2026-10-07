import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { PDF_READER_PLACEHOLDER_TEXT } from '../../lib/core/nodes/nodeOpeningPreview.js';

import { openDatabaseConnection } from './connection.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';
import type { PdfPageTextInput } from './pdfPageTextRows.js';

interface PdfReferenceNodeRow extends DatabaseRow {
  id: string;
  title: string;
}

function buildPdfBodyContent(title: string, pages: PdfPageTextInput[]) {
  const text = [...pages]
    .sort((left, right) => left.page - right.page)
    .map((page) => page.text.trim())
    .filter(Boolean)
    .join('\n\n');
  return text ? `# ${title.trim() || 'Untitled'}\n\n${text}` : '';
}

function listPdfReferenceNodes(attachmentId: string, bodyStorage: 'continuous' | 'chunked') {
  const driver = openDatabaseConnection().driver;
  const candidates = driver.queryAll<PdfReferenceNodeRow>(
    `SELECT n.id, n.title FROM nodes n
     INNER JOIN json_each(n.resource_references) resource
       ON json_extract(resource.value, '$.role') = 'reference'
     WHERE json_extract(resource.value, '$.storage_key') = ? AND n.deleted_at IS NULL`,
    [`${attachmentId}.pdf`]
  );
  return candidates.filter((node) => {
    const body = loadNodeBodyResolution(driver, node.id, bodyStorage);
    if (body?.status !== 'resolved') return false;
    return driver.queryOne<{ matches: number }>('SELECT ? LIKE ? AS matches',
      [body.content, `%${PDF_READER_PLACEHOLDER_TEXT}%`])?.matches === 1;
  });
}

export function syncPdfBodyBlobsForReferenceNodes(
  attachmentId: string,
  pages: PdfPageTextInput[],
  hostName: string,
  now: string,
  bodyStorage: 'continuous' | 'chunked' = 'continuous'
) {
  const nodes = listPdfReferenceNodes(attachmentId, bodyStorage);
  const updatedNodeIds: string[] = [];
  for (const node of nodes) {
    const bodyContent = buildPdfBodyContent(node.title, pages);
    if (!bodyContent) {
      continue;
    }
    writeNodeBody({ bodyStorage, content: bodyContent, driver: openDatabaseConnection().driver, nodeId: node.id, title: node.title, updatedAt: now });
    openDatabaseConnection().driver.execute(
      `UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [hostName, node.id]
    );
    flushNodeSyncVersion(node.id, now, bodyStorage);
    updatedNodeIds.push(node.id);
  }
  return updatedNodeIds;
}
