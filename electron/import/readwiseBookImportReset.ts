import type { NodeKind } from '../../lib/core/nodes/nodeKind.js';
import type { NativeReadwiseBookImportResetResult } from '../../lib/platform/nativeReadwiseContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { deleteNodesPermanently, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { loadReadwiseBooksInventory, type ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';
import {
  findPersistedReadwiseBookByNodeId,
  savePersistedReadwiseBooksInventory
} from './readwiseBooksInventoryState.js';

interface ActiveNodeRow {
  [column: string]: unknown;
  created_at: string;
  desired_retention: number | null;
  hide_title_heading: number;
  id: string;
  is_title_manual: number;
  kind: NodeKind;
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  title: string;
}

async function loadBookByNodeId(nodeId: string) {
  const inventory = await loadReadwiseBooksInventory();
  const book =
    inventory.books.find(
      (candidate) =>
        candidate.generatedNodeId === nodeId || buildReadwiseBookPlaceholderNodeId(candidate.bookKey) === nodeId
    ) ?? null;
  if (book) {
    return { book, inventory };
  }
  return findPersistedReadwiseBookByNodeId(nodeId) ?? { book: null, inventory };
}

function readActiveNode(nodeId: string) {
  return (
    openDatabaseConnection().driver.queryOne<ActiveNodeRow>(
      `SELECT n.id,
              n.parent_id,
              n.kind,
              n.priority,
              n.desired_retention,
              n.title,
              n.is_title_manual,
              n.hide_title_heading,
              n.created_at,
              o.position
       FROM nodes n
       LEFT JOIN node_order o ON o.node_id = n.id
       WHERE n.id = ? AND n.deleted_at IS NULL`,
      [nodeId]
    ) ?? null
  );
}

function listDescendantNodeIds(rootNodeId: string) {
  return openDatabaseConnection()
    .driver.queryAll<{ id: string }>(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL
         UNION ALL
         SELECT child.id
         FROM nodes child
         JOIN descendants ON child.parent_id = descendants.id
         WHERE child.deleted_at IS NULL
       )
       SELECT id FROM descendants`,
      [rootNodeId]
    )
    .map((row) => row.id);
}

function listNodeOrderWithout(removedNodeIds: Set<string>) {
  return openDatabaseConnection()
    .driver.queryAll<{ node_id: string }>('SELECT node_id FROM node_order ORDER BY position ASC')
    .map((row) => row.node_id)
    .filter((nodeId) => !removedNodeIds.has(nodeId));
}

function buildResetBook(book: ReadwiseBookInventoryItem, nodeId: string) {
  return {
    ...book,
    epubPath: null,
    epubStatus: 'missing',
    generatedNodeId: nodeId,
    importStatus: 'pending',
    nodeStatus: 'generated'
  } satisfies ReadwiseBookInventoryItem;
}

function createBookNotFoundResult(book?: ReadwiseBookInventoryItem | null): NativeReadwiseBookImportResetResult {
  return {
    book_key: book?.bookKey ?? null,
    content: null,
    node_id: null,
    removed_node_ids: [],
    status: 'book_not_found',
    title: book?.title ?? null,
    updated_at: null
  };
}

function resetImportedTree(activeNode: ActiveNodeRow, book: ReadwiseBookInventoryItem) {
  const updatedAt = new Date().toISOString();
  const descendantNodeIds = listDescendantNodeIds(activeNode.id);
  if (descendantNodeIds.length > 0) {
    deleteNodesPermanently({
      nodeIds: descendantNodeIds,
      nodeOrder: listNodeOrderWithout(new Set(descendantNodeIds))
    });
  }
  const resetBook = buildResetBook(book, activeNode.id);
  const placeholderContent = buildReadwiseBookPlaceholderContent(resetBook);
  upsertNodeSnapshot({
    nodeId: activeNode.id,
    parentNodeId: activeNode.parent_id,
    kind: activeNode.kind,
    priority: activeNode.priority,
    desiredRetention: activeNode.desired_retention,
    title: activeNode.title,
    isTitleManual: activeNode.is_title_manual === 1,
    hideTitleHeading: activeNode.hide_title_heading === 1,
    content: placeholderContent,
    reveal: null,
    anchorLink: null,
    position: activeNode.position,
    createdAt: activeNode.created_at,
    updatedAt
  });
  return { descendantNodeIds, placeholderContent, resetBook, updatedAt };
}

export async function resetReadwiseBookImport(nodeId: string): Promise<NativeReadwiseBookImportResetResult> {
  const { book, inventory } = await loadBookByNodeId(nodeId);
  if (!book) {
    return createBookNotFoundResult();
  }

  const activeNode = readActiveNode(nodeId);
  if (!activeNode) {
    return createBookNotFoundResult(book);
  }

  const { descendantNodeIds, placeholderContent, resetBook, updatedAt } = resetImportedTree(activeNode, book);

  savePersistedReadwiseBooksInventory({
    ...inventory,
    books: inventory.books.map((candidate) => (candidate.bookKey === resetBook.bookKey ? resetBook : candidate)),
    scannedAt: updatedAt
  });

  return {
    book_key: resetBook.bookKey,
    content: placeholderContent,
    node_id: activeNode.id,
    removed_node_ids: descendantNodeIds,
    status: 'reset',
    title: resetBook.title,
    updated_at: updatedAt
  };
}
