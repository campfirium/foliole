import { parseStoredAnchorLink, type StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { findUniqueAvailableImportedBodyOccurrence } from '../../lib/core/database/importHighlightBodyMatching.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { openDatabaseConnection } from '../database/connection.js';

export interface ReadwiseSourceLocalAnchor extends DatabaseRow {
  anchor_link: string;
  id: string;
}

function originalText(anchor: StoredAnchorLink) {
  const locator = anchor.locator;
  return locator && 'originalText' in locator && typeof locator.originalText === 'string'
    ? locator.originalText : null;
}

function locate(content: string, anchor: StoredAnchorLink) {
  const text = originalText(anchor);
  if (!text) return null;
  const result = findUniqueAvailableImportedBodyOccurrence(content, text, []);
  return result ? JSON.stringify({
    id: anchor.id,
    kind: anchor.kind,
    locator: { from: result.from, originalText: text, to: result.to }
  }) : null;
}

export function relocateReadwiseSourceLocalAnchors(input: {
  importedAt: string;
  localAnchors: ReadwiseSourceLocalAnchor[];
  rootNodeId: string;
}) {
  const driver = openDatabaseConnection().driver;
  const body = driver.queryOne<NodeBodyRow>(
    `SELECT n.content, n.body_blob_hash, cbd.data body_blob_data FROM nodes n
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`,
    [input.rootNodeId]
  );
  if (!body) throw new Error('readwise_resync_root_missing');
  const content = requireResolvedNodeBody(body, input.rootNodeId).content;
  for (const row of input.localAnchors) {
    const current = driver.queryOne<{ id: string }>(
      'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [row.id]
    );
    if (!current) continue;
    const anchor = parseStoredAnchorLink(row.anchor_link);
    if (!anchor) continue;
    const anchorLink = locate(content, anchor)
      ?? JSON.stringify({ id: anchor.id, kind: anchor.kind });
    driver.execute(
      `UPDATE nodes SET anchor_link = ?, image_regions = NULL, updated_at = ?, sync_dirty = 1 WHERE id = ?`,
      [anchorLink, input.importedAt, row.id]
    );
  }
}

export function captureReadwiseSourceLocalAnchors(
  rootNodeId: string,
  trackedNodeIds: ReadonlySet<string>
) {
  return openDatabaseConnection().driver.queryAll<ReadwiseSourceLocalAnchor>(
    `SELECT id, anchor_link FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL`,
    [rootNodeId]
  ).filter((row) => !trackedNodeIds.has(row.id));
}
