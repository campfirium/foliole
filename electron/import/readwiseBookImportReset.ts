import type { NodeKind } from '../../lib/core/nodes/nodeKind.js';
import type { NativeReadwiseBookImportResetResult } from '../../lib/platform/nativeReadwiseContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { deleteNodesPermanently, upsertNodeSnapshot } from '../database/nodeMutations.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { loadReadwiseBooksInventory, type ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';
import {
  findPersistedReadwiseBookByNodeId,
  savePersistedReadwiseBookMovedToTop
} from './readwiseBooksInventoryState.js';
import { canRunReadwiseExternalSource } from './readwiseExternalSourceGuard.js';

const INBOX_NODE_ID = 'special-inbox';

interface ActiveNodeRow {
  [column: string]: unknown;
  created_at: string;
  desired_retention: number | null;
  hide_title_heading: number;
  id: string;
  is_title_manual: number;
  kind: NodeKind;
  parent_id: string | null;
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
              n.created_at
       FROM nodes n
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
    .driver.queryAll<{ node_id: string }>(
      `SELECT node_order.node_id
       FROM node_order
       JOIN nodes ON nodes.id = node_order.node_id
       WHERE nodes.kind = 'folder'
       ORDER BY node_order.position ASC`
    )
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

function rebuildPlaceholderNode(book: ReadwiseBookInventoryItem, nodeId: string) {
  const updatedAt = new Date().toISOString();
  const resetBook = buildResetBook(book, nodeId);
  const placeholderContent = buildReadwiseBookPlaceholderContent(resetBook);
  upsertNodeSnapshot({
    anchorLink: null,
    content: placeholderContent,
    createdAt: updatedAt,
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    openingText: null,
    parentNodeId: INBOX_NODE_ID,
    position: null,
    reveal: null,
    title: resetBook.title,
    updatedAt
  });
  return { placeholderContent, resetBook, updatedAt };
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
    openingText: null,
    reveal: null,
    anchorLink: null,
    position: null,
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
  if (!canRunReadwiseExternalSource({ readwiseReaderEnabled: loadImportManagerSettings().readwiseReaderConfig.enabled })) {
    return {
      book_key: book.bookKey,
      content: null,
      node_id: book.generatedNodeId ?? null,
      removed_node_ids: [],
      status: 'blocked_secondary',
      title: book.title,
      updated_at: null
    };
  }

  const activeNode = readActiveNode(nodeId);
  if (!activeNode) {
    const restoredNodeId = book.generatedNodeId ?? nodeId;
    const { placeholderContent, resetBook, updatedAt } = rebuildPlaceholderNode(book, restoredNodeId);
    const updatedInventory = {
      ...inventory,
      books: inventory.books.map((candidate) => (candidate.bookKey === resetBook.bookKey ? resetBook : candidate)),
      scannedAt: updatedAt
    };
    savePersistedReadwiseBookMovedToTop(updatedInventory, resetBook.bookKey);
    return {
      book_key: resetBook.bookKey,
      content: placeholderContent,
      node_id: restoredNodeId,
      removed_node_ids: [],
      status: 'reset',
      title: resetBook.title,
      updated_at: updatedAt
    };
  }

  const { descendantNodeIds, placeholderContent, resetBook, updatedAt } = resetImportedTree(activeNode, book);

  savePersistedReadwiseBookMovedToTop(
    {
    ...inventory,
    books: inventory.books.map((candidate) => (candidate.bookKey === resetBook.bookKey ? resetBook : candidate)),
    scannedAt: updatedAt
    },
    resetBook.bookKey
  );

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
