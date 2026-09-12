import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';

interface BodyRow extends NodeBodyRow { id: string; title: string }

export function applyReadwiseSourceProjection(
  nodeId: string,
  document: PreparedReadwiseApiDocument,
  now = new Date().toISOString()
) {
  if (document.category === 'epub' && document.epubStructure?.sections.length) return false;
  if (!document.body.trim()) return false;
  const driver = openDatabaseConnection().driver;
  const row = loadBodyRow(nodeId);
  if (!row) return false;
  return driver.transaction((tx) => applyParentContentChange({
    driver: tx,
    nextContent: document.body,
    nodeId: row.id,
    previousContent: requireResolvedNodeBody(row, row.id).content,
    title: row.title,
    updatedAt: now
  }).written);
}

export function mergeLegacyReadwiseAnnotations(
  document: PreparedReadwiseApiDocument,
  legacyAnnotations: PreparedReadwiseApiDocument['annotations']
) {
  const legacyById = new Map(legacyAnnotations.map((item) => [item.remoteId, item]));
  const merged = document.annotations.map((item) => {
    const legacy = legacyById.get(item.remoteId);
    return legacy?.locatorText ? { ...item, locatorText: legacy.locatorText } : item;
  });
  const existingIds = new Set(merged.map((item) => item.remoteId));
  return {
    ...document,
    annotations: [...merged, ...legacyAnnotations.filter((item) => !existingIds.has(item.remoteId))]
  };
}

function loadBodyRow(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<BodyRow>(
    `SELECT n.id, n.title, n.content, n.body_blob_hash, cbd.data body_blob_data FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ? AND n.deleted_at IS NULL`,
    [nodeId]
  );
}
