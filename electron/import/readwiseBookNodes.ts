import { createHash } from 'node:crypto';

import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import type { ReadwiseBookInventoryItem, ReadwiseBooksInventory } from './readwiseBooksInventory.js';

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

function hasActiveNode(nodeId: string) {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [nodeId]);
  return Boolean(row?.id);
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
    parentNodeId: null,
    position,
    reveal: null,
    title: book.title,
    updatedAt
  });
  return nodeId;
}

export function ensureReadwiseBookNodes(inventory: ReadwiseBooksInventory): ReadwiseBooksInventory {
  let nextNodePosition = resolveNextNodePosition();

  return {
    ...inventory,
    books: inventory.books.map((book) => {
      if (book.generatedNodeId) {
        return book;
      }

      const placeholderNodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
      const generatedNodeId = hasActiveNode(placeholderNodeId)
        ? placeholderNodeId
        : createReadwiseBookNode(book, nextNodePosition++, inventory.scannedAt);

      return {
        ...book,
        generatedNodeId,
        nodeStatus: 'generated'
      } satisfies ReadwiseBookInventoryItem;
    })
  } satisfies ReadwiseBooksInventory;
}
