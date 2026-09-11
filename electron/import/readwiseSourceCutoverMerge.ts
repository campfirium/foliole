import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { hasPersistedReadwiseApiEpubStructure } from './readwiseApiEpubMaterialization.js';

export function shouldRebuildPristineReadwiseEpub(input: {
  connectionRef: string;
  document: PreparedReadwiseApiDocument;
}) {
  if (input.document.category !== 'epub' || !input.document.epubStructure?.sections.length) return false;
  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  if (!existing?.nodeId || hasPersistedReadwiseApiEpubStructure(existing.nodeId)) return false;
  const tree = openDatabaseConnection().driver.queryOne<{ edited: number; structural_children: number }>(
    `WITH RECURSIVE tree(id, depth) AS (
       SELECT id, 0 FROM nodes WHERE id = ? AND deleted_at IS NULL
       UNION ALL SELECT child.id, tree.depth + 1 FROM nodes child JOIN tree ON child.parent_id = tree.id
       WHERE child.deleted_at IS NULL
     ) SELECT
       SUM(CASE WHEN n.anchor_link IS NULL AND n.created_at <> n.updated_at THEN 1 ELSE 0 END) edited,
       SUM(CASE WHEN tree.depth > 0 AND n.anchor_link IS NULL THEN 1 ELSE 0 END) structural_children
     FROM nodes n JOIN tree ON tree.id = n.id`,
    [existing.nodeId]
  );
  return (tree?.edited ?? 0) === 0 && (tree?.structural_children ?? 0) === 0;
}
