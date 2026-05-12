import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';
import { syncWorkspaceSearchIndexForNodeIds } from './workspaceSearchIndex.js';

interface ExistingChildHighlightRow {
  [column: string]: unknown;
  anchor_link: string | null;
  content: string;
  id: string;
}

function isImportedAnchorLink(value: string | null) {
  if (!value) {
    return false;
  }
  try {
    const parsed = JSON.parse(value) as { origin?: unknown };
    return parsed?.origin === 'imported';
  } catch {
    return false;
  }
}

export function readExistingChildHighlights(driver: DatabaseDriver, parentNodeId: string) {
  return driver.queryAll<ExistingChildHighlightRow>(
    `SELECT id, content, anchor_link
     FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL`,
    [parentNodeId]
  );
}

export function replaceImportedHighlightNodes(input: {
  driver: DatabaseDriver;
  highlights: AnchoredImportedHighlightRecord[];
  importedAt: string;
  parentNodeId: string;
  parentContent: string;
}) {
  const existingChildren = readExistingChildHighlights(input.driver, input.parentNodeId).filter((row) =>
    isImportedAnchorLink(row.anchor_link)
  );
  existingChildren.forEach((row) => {
    input.driver.execute('DELETE FROM node_order WHERE node_id = ?', [row.id]);
    input.driver.execute('DELETE FROM nodes WHERE id = ?', [row.id]);
  });
  syncWorkspaceSearchIndexForNodeIds(
    input.driver,
    existingChildren.map((row) => row.id)
  );
  if (input.highlights.length === 0) {
    return 0;
  }
  return insertImportedHighlightNodes({
    driver: input.driver,
    highlights: input.highlights,
    importedAt: input.importedAt,
    parentNodeId: input.parentNodeId,
    parentContent: input.parentContent
  });
}
