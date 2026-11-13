import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { parseNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { buildPdfReaderPlaceholder } from '../../lib/core/import/pdfReaderPlaceholder.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { assertTextBodyWithinBudget, TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../../lib/core/nodes/textBodyBudget.js';
import { PDF_TEXT_EXTRACTOR_VERSION } from '../../lib/core/sync/pdfTextArtifact.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

type Repair = {
  nodeId: string;
  pdfHash: string;
  expectedBodyHash: string;
  expectedPageCount: number;
  hostName: string;
  now: string;
};

type Candidate = {
  title: string;
  source_name: string;
  content: string;
  body_blob_hash: string;
  resource_references: string;
  current_version_id: string;
  body_text: string;
  version_body_hash: string;
  content_hash: string;
  parent_version_id: string | null;
};

const CANDIDATE = `SELECT n.title, s.source_name, n.content, n.body_blob_hash, n.resource_references,
    n.current_version_id, v.body_text, json_extract(v.snapshot_json, '$.body_blob_hash') AS version_body_hash,
    v.content_hash, v.parent_version_id
  FROM nodes n JOIN import_sources s ON s.latest_node_id = n.id AND s.source_fingerprint = n.import_source_fingerprint
  JOIN node_sync_versions v ON v.version_id = n.current_version_id AND v.object_id = n.id
  WHERE n.id = ? AND n.kind = 'topic' AND n.deleted_at IS NULL AND n.sync_dirty = 0
    AND s.provider = 'desktop_text_file' AND s.source_kind = 'pdf'`;

const PROTECTED = `WITH target(node, version) AS (VALUES (?, ?))
  SELECT 1 FROM node_version_local_holds WHERE object_id = (SELECT node FROM target)
  UNION ALL SELECT 1 FROM node_sync_conflicts WHERE object_id = (SELECT node FROM target)
  UNION ALL SELECT 1 FROM node_text_alternatives WHERE node_id = (SELECT node FROM target)
  UNION ALL SELECT 1 FROM nodes WHERE parent_id = (SELECT node FROM target) AND anchor_link IS NOT NULL
  UNION ALL SELECT 1 FROM nodes WHERE anchor_source_version_id = (SELECT version FROM target)
  UNION ALL SELECT 1 FROM node_sync_versions v WHERE v.object_id = (SELECT node FROM target) AND v.version_id != (SELECT version FROM target)
    AND NOT EXISTS (SELECT 1 FROM node_sync_version_parents p WHERE p.parent_version_id = v.version_id)
  LIMIT 1`;

function readVerifiedPages(driver: DatabaseDriver, input: Repair, node: Candidate) {
  const references = parseNodeResourceReferences(node.resource_references)
    .filter(ref => ref.role === 'reference' && ref.storage_key.endsWith('.pdf'));
  if (references.length !== 1 || references[0]?.storage_key !== `${input.pdfHash}.pdf`) {
    throw new Error('pdf_body_repair_reference_changed');
  }
  const pages = driver.queryAll<{ page: number; text: string }>(`SELECT page, text FROM pdf_page_text
    WHERE attachment_id = ? AND EXISTS (SELECT 1 FROM pdf_index_state s
      WHERE s.attachment_id = pdf_page_text.attachment_id AND s.status = 'ready' AND s.version = ?)
    ORDER BY page`, [input.pdfHash, PDF_TEXT_EXTRACTOR_VERSION]);
  const text = pages.map(page => page.text.trim()).filter(Boolean).join('\n\n');
  if (pages.length !== input.expectedPageCount || pages.some((row, index) => row.page !== index + 1) ||
      !text || `# ${node.title.trim() || 'Untitled'}\n\n${text}` !== node.content) {
    throw new Error('pdf_body_repair_pages_do_not_match');
  }
  return pages;
}

function assertRetiredAncestor(driver: DatabaseDriver, node: Candidate, nextId: string) {
  const old = driver.queryOne<{ content_hash: string; parent_version_id: string | null; retired: number }>(`
    SELECT v.content_hash, v.parent_version_id, json_extract(v.snapshot_json, '$.body_deleted') AS retired
    FROM node_sync_versions v JOIN node_sync_version_parents p ON p.parent_version_id = v.version_id
    WHERE v.version_id = ? AND p.version_id = ? AND v.body_text IS NULL`, [node.current_version_id, nextId]);
  if (!old || old.retired !== 1 || old.content_hash !== node.content_hash ||
      old.parent_version_id !== node.parent_version_id) throw new Error('pdf_body_repair_ancestor_not_preserved');
}

/** Repairs a specifically identified legacy PDF import using its verified page text. */
export function repairOversizedPdfBody(driver: DatabaseDriver, input: Repair) {
  return driver.transaction(() => {
    const node = driver.queryOne<Candidate>(CANDIDATE, [input.nodeId]);
    if (!node) throw new Error('pdf_body_repair_source_changed');
    const placeholder = buildPdfReaderPlaceholder(node.source_name);
    if (node.content === placeholder && node.body_text === placeholder) return null;
    if (utf8ByteLength(node.content) <= TEXT_BODY_MAX_BYTES || node.body_text !== node.content ||
        node.body_blob_hash !== input.expectedBodyHash || node.version_body_hash !== input.expectedBodyHash ||
        hashTextBody(node.content) !== input.expectedBodyHash) throw new Error('pdf_body_repair_source_changed');
    if (driver.queryOne(PROTECTED, [input.nodeId, node.current_version_id])) {
      throw new Error('pdf_body_repair_has_protected_history');
    }
    const pages = readVerifiedPages(driver, input, node);
    assertTextBodyWithinBudget(placeholder);
    writeNodeBody({ driver, nodeId: input.nodeId, title: node.title, content: placeholder, updatedAt: input.now });
    const first = pages.find(page => page.text.trim());
    if (first) driver.execute('UPDATE nodes SET opening_text = ? WHERE id = ?',
      [resolveNodeOpeningText(first.text, node.title), input.nodeId]);
    const nextId = flushNodeSyncVersionWithDriver(driver, input.nodeId, input.hostName, input.now);
    if (!nextId) throw new Error('pdf_body_repair_version_not_published');
    assertRetiredAncestor(driver, node, nextId);
    return nextId;
  });
}
