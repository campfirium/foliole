import { createHash } from 'node:crypto';

import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import type { ReadwiseBookInventoryItem, ReadwiseBooksInventory } from './readwiseBooksInventory.js';

export const READWISE_BOOK_AUTO_NODE_POLICY = 'all_books';
const INBOX_NODE_ID = 'special-inbox';

interface ActiveNodeRow {
  [column: string]: unknown;
  anchor_link: string | null;
  content: string;
  created_at: string;
  desired_retention: number | null;
  hide_title_heading: number;
  id: string;
  is_title_manual: number;
  kind: 'folder' | 'item' | 'topic';
  parent_id: string | null;
  position: number | null;
  priority: number | null;
  reveal: string | null;
  title: string;
}

interface ExistingNodeRow {
  [column: string]: unknown;
  deleted_at: string | null;
  id: string;
}

function formatAnnotationStatus(status: ReadwiseBookInventoryItem['annotationStatus']) {
  return status === 'has_highlights' ? 'Highlights available' : 'No highlights yet';
}

function formatEpubStatus(status: ReadwiseBookInventoryItem['epubStatus']) {
  return status === 'received' ? 'EPUB received' : 'EPUB missing';
}

function formatImportStatus(status: ReadwiseBookInventoryItem['importStatus']) {
  return status === 'completed' ? 'Book import completed' : 'Book import pending';
}

export function buildReadwiseBookPlaceholderNodeId(bookKey: string) {
  const digest = createHash('sha256').update(`readwise-book\u001f${bookKey}`).digest('hex').slice(0, 24);
  return `node-readwise-book-${digest}`;
}

export function buildReadwiseBookPlaceholderContent(book: ReadwiseBookInventoryItem) {
  return [
    `# ${book.title}`,
    '',
    '## Current status',
    `- ${formatAnnotationStatus(book.annotationStatus)}`,
    `- ${formatEpubStatus(book.epubStatus)}`,
    `- ${formatImportStatus(book.importStatus)}`,
    '',
    '## Next actions',
    '- Download EPUB*',
    '- Load EPUB*',
    '',
    '*In progress. These actions will be connected in a later task.*'
  ].join('\n');
}

function resolveNextNodePosition() {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ position: number | null }>('SELECT MAX(position) AS position FROM node_order');
  return (row?.position ?? -1) + 1;
}

function readActiveNode(nodeId: string) {
  const connection = openDatabaseConnection();
  return (
    connection.driver.queryOne<ActiveNodeRow>(
      `SELECT n.id,
              n.parent_id,
              n.kind,
              n.priority,
              n.desired_retention,
              n.title,
              n.is_title_manual,
              n.hide_title_heading,
              n.content,
              n.reveal,
              n.anchor_link,
              n.created_at,
              o.position
       FROM nodes n
       LEFT JOIN node_order o ON o.node_id = n.id
       WHERE n.id = ? AND n.deleted_at IS NULL`,
      [nodeId]
    ) ?? null
  );
}

function readNodeIncludingDeleted(nodeId: string) {
  const connection = openDatabaseConnection();
  return (
    connection.driver.queryOne<ExistingNodeRow>(
      `SELECT id, deleted_at
       FROM nodes
       WHERE id = ?`,
      [nodeId]
    ) ?? null
  );
}

function ensureReadwiseBookNodeInInbox(node: ActiveNodeRow, updatedAt: string) {
  if (node.parent_id === INBOX_NODE_ID && typeof node.position === 'number') {
    return node.id;
  }

  upsertNodeSnapshot({
    anchorLink: null,
    content: node.content,
    createdAt: node.created_at,
    desiredRetention: node.desired_retention,
    hideTitleHeading: node.hide_title_heading === 1,
    isTitleManual: node.is_title_manual === 1,
    kind: node.kind,
    nodeId: node.id,
    parentNodeId: INBOX_NODE_ID,
    position: resolveNextNodePosition(),
    priority: node.priority,
    reveal: node.reveal,
    title: node.title,
    updatedAt
  });

  return node.id;
}

function createReadwiseBookNode(book: ReadwiseBookInventoryItem, position: number, updatedAt: string) {
  const nodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  upsertNodeSnapshot({
    anchorLink: null,
    content: buildReadwiseBookPlaceholderContent(book),
    createdAt: updatedAt,
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    parentNodeId: INBOX_NODE_ID,
    position,
    reveal: null,
    title: book.title,
    updatedAt
  });
  return nodeId;
}

export function shouldAutoGenerateReadwiseBookNode(book: ReadwiseBookInventoryItem) {
  if (book.annotationStatus === 'has_highlights') {
    return true;
  }

  return READWISE_BOOK_AUTO_NODE_POLICY === 'all_books';
}

export function ensureReadwiseBookNodes(inventory: ReadwiseBooksInventory): ReadwiseBooksInventory {
  let nextNodePosition = resolveNextNodePosition();

  return {
    ...inventory,
    books: inventory.books.map((book) => {
      if (book.generatedNodeId) {
        const activeNode = readActiveNode(book.generatedNodeId);
        if (activeNode) {
          return book;
        }
        return { ...book, nodeStatus: 'missing' } satisfies ReadwiseBookInventoryItem;
      }
      if (!shouldAutoGenerateReadwiseBookNode(book)) {
        return { ...book, generatedNodeId: null, nodeStatus: 'missing' } satisfies ReadwiseBookInventoryItem;
      }

      const placeholderNodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
      const deletedPlaceholderNode = readNodeIncludingDeleted(placeholderNodeId);
      if (deletedPlaceholderNode?.deleted_at) {
        return {
          ...book,
          generatedNodeId: placeholderNodeId,
          nodeStatus: 'missing'
        } satisfies ReadwiseBookInventoryItem;
      }
      const existingNode = readActiveNode(placeholderNodeId);
      const generatedNodeId = existingNode
        ? ensureReadwiseBookNodeInInbox(existingNode, inventory.scannedAt)
        : createReadwiseBookNode(book, nextNodePosition++, inventory.scannedAt);

      return {
        ...book,
        generatedNodeId,
        nodeStatus: 'generated'
      } satisfies ReadwiseBookInventoryItem;
    })
  } satisfies ReadwiseBooksInventory;
}
