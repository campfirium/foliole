import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { rewriteExistingNodeOrder } from '../../lib/core/database/nodeOrderMutations.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import {
  buildReadwiseApiEpubBookNodes,
  type ReadwiseApiEpubBookNode
} from '../../lib/core/readwise/readwiseApiEpubBookTree.js';
import { stableReadwiseEpubNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';

import { replaceReadwiseApiEpubImageLinks } from './readwiseApiEpubImageLinks.js';

export { buildReadwiseApiEpubBookNodes };

export function persistReadwiseApiEpubBookNodes(input: {
  connectionRef: string;
  documentId: string;
  importedAt: string;
  nodes: ReadwiseApiEpubBookNode[];
  rootNodeId: string;
}) {
  const driver = openDatabaseConnection().driver;
  const nodeIds = new Map(input.nodes.map((node) => [
    node.key,
    stableReadwiseEpubNodeId(input.connectionRef, input.documentId, node.key)
  ]));
  input.nodes.forEach((node, index) => {
    const nodeId = nodeIds.get(node.key)!;
    upsertNodeSnapshot(driver, {
      anchorLink: null,
      content: node.content,
      createdAt: orderedTimestamp(input.importedAt, index),
      hideTitleHeading: false,
      isTitleManual: true,
      kind: 'topic',
      nodeId,
      parentNodeId: node.parentKey ? (nodeIds.get(node.parentKey) ?? input.rootNodeId) : input.rootNodeId,
      position: null,
      reveal: null,
      title: node.title,
      updatedAt: input.importedAt
    });
    replaceReadwiseApiEpubImageLinks(nodeId, node.attachmentIds);
  });
  retireObsoleteBookNodes(driver, input.rootNodeId, new Set(nodeIds.values()), input.importedAt);
  orderBookNodes(driver, input.rootNodeId, [...nodeIds.values()]);
}

function orderBookNodes(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  rootNodeId: string,
  nodeIds: string[]
) {
  const current = driver.queryAll<{ node_id: string }>(
    'SELECT node_id FROM node_order ORDER BY position ASC'
  ).map((row) => row.node_id);
  const rootIndex = current.indexOf(rootNodeId);
  if (rootIndex < 0) return;
  const generated = new Set(driver.queryAll<{ id: string }>(
    `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM nodes WHERE parent_id = ?
       UNION ALL SELECT child.id FROM nodes child JOIN descendants ON child.parent_id = descendants.id
     ) SELECT id FROM descendants WHERE id LIKE 'node-epub-%'`, [rootNodeId]
  ).map((row) => row.id));
  const ordered = current.filter((nodeId) => !generated.has(nodeId));
  ordered.splice(ordered.indexOf(rootNodeId) + 1, 0, ...nodeIds);
  rewriteExistingNodeOrder(driver, ordered);
}

function retireObsoleteBookNodes(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  rootNodeId: string,
  retainedNodeIds: ReadonlySet<string>,
  deletedAt: string
) {
  const generated = driver.queryAll<{ id: string }>(
    `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
       UNION ALL SELECT child.id FROM nodes child JOIN descendants ON child.parent_id = descendants.id
       WHERE child.deleted_at IS NULL
     ) SELECT id FROM descendants WHERE id LIKE 'node-epub-%'`, [rootNodeId]
  );
  const obsoleteIds = generated.map((row) => row.id).filter((nodeId) => !retainedNodeIds.has(nodeId));
  if (obsoleteIds.length === 0) return;
  const marks = obsoleteIds.map(() => '?').join(', ');
  const movedChildIds = driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes WHERE parent_id IN (${marks}) AND deleted_at IS NULL
     AND id NOT IN (${marks})`, [...obsoleteIds, ...obsoleteIds]
  ).map((row) => row.id);
  driver.execute(
    `UPDATE nodes SET parent_id = ?, updated_at = ?, sync_dirty = 1
     WHERE parent_id IN (${marks}) AND deleted_at IS NULL AND id NOT IN (${marks})`,
    [rootNodeId, deletedAt, ...obsoleteIds, ...obsoleteIds]
  );
  driver.execute(
    `UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1
     WHERE id IN (${marks}) AND deleted_at IS NULL`, [deletedAt, deletedAt, ...obsoleteIds]
  );
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, [...obsoleteIds, ...movedChildIds]);
}

function orderedTimestamp(timestamp: string, index: number) {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? new Date(value + index + 1).toISOString() : timestamp;
}
