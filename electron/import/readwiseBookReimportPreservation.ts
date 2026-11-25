import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { ensureNodesParentMembership } from '../../lib/core/database/nodeOrderMutations.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';

import { ensureReadwiseUnlocatedNode, placeReadwiseUnlocatedNodeLast } from './readwiseBookUnlocated.js';

export function preserveReadwiseBookExcerpts(input: {
  bookKey: string;
  driver: DatabaseDriver;
  importedAt: string;
  rootNodeId: string;
}) {
  const rows = input.driver.queryAll<{ id: string; parent_id: string; anchor_link: string | null; kind: string; is_title_manual: number }>(
    `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT child.id FROM nodes child JOIN descendants ON child.parent_id = descendants.id
       WHERE +child.deleted_at IS NULL
     ), retained(id) AS (
       SELECT id FROM nodes WHERE id IN (SELECT id FROM descendants) AND (anchor_link IS NOT NULL OR kind='item' OR (is_title_manual=0 AND id NOT LIKE 'node-body-part-%'))
       UNION SELECT child.id FROM nodes child JOIN retained ON child.parent_id=retained.id WHERE +child.deleted_at IS NULL
     ) SELECT id,parent_id,anchor_link,kind,is_title_manual FROM nodes WHERE id IN (SELECT id FROM retained)`, [input.rootNodeId]
  );
  const excerpts = rows.filter(row => row.anchor_link || row.kind === 'item'
    || (row.is_title_manual === 0 && !row.id.startsWith('node-body-part-')));
  const retained = new Set(rows.map(row => row.id));
  if (!retained.size) return retained;
  const unlocatedId = ensureReadwiseUnlocatedNode({
    connectionRef: 'local-books', documentId: input.bookKey, driver: input.driver,
    importedAt: input.importedAt, rootNodeId: input.rootNodeId
  });
  const moved: string[] = [];
  for (const row of excerpts) {
    const anchor = parseStoredAnchorLink(row.anchor_link);
    const parentId = retained.has(row.parent_id) ? row.parent_id : unlocatedId;
    if (parentId !== row.parent_id) moved.push(row.id);
    input.driver.execute(`UPDATE nodes SET parent_id=?,anchor_link=?,image_regions=NULL,updated_at=?,sync_dirty=1 WHERE id=?`,
      [parentId,
        detachBookAnchor(row.anchor_link, anchor), input.importedAt, row.id]);
  }
  retained.add(unlocatedId);
  ensureNodesParentMembership(input.driver, moved);
  placeReadwiseUnlocatedNodeLast(input.driver, input.rootNodeId, unlocatedId);
  enqueueWorkspaceSearchInvalidationForNodeIds(input.driver, [...retained]);
  return retained;
}

function detachBookAnchor(value: string | null, anchor: ReturnType<typeof parseStoredAnchorLink>) {
  if (!anchor) return null;
  if (anchor.kind !== 'highlight' || !anchor.id.startsWith('imported-highlight-')) {
    return JSON.stringify({ id: anchor.id, kind: anchor.kind });
  }
  const previous = JSON.parse(value!) as { readwiseBookSourceText?: string };
  const locator = anchor.locator;
  const originalText = locator && 'originalText' in locator ? locator.originalText : previous.readwiseBookSourceText;
  return JSON.stringify({ id: anchor.id, kind: anchor.kind, origin: 'imported', readwiseBookSourceText: originalText });
}
