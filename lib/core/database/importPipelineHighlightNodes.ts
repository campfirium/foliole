import type { DatabaseDriver } from './driver.js';
import { insertImportedHighlightNodes } from './importDerivedHighlights.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';

interface ExistingChildHighlightRow {
  [column: string]: unknown;
  anchor_link: string | null;
  content: string;
  id: string;
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
  startPosition: number;
}) {
  const existingChildren = readExistingChildHighlights(input.driver, input.parentNodeId).filter((row) => row.anchor_link !== null);
  existingChildren.forEach((row) => {
    input.driver.execute('DELETE FROM node_order WHERE node_id = ?', [row.id]);
    input.driver.execute('DELETE FROM nodes WHERE id = ?', [row.id]);
  });
  if (input.highlights.length === 0) {
    return 0;
  }
  return insertImportedHighlightNodes({
    driver: input.driver,
    highlights: input.highlights,
    importedAt: input.importedAt,
    parentNodeId: input.parentNodeId,
    startPosition: input.startPosition
  });
}
