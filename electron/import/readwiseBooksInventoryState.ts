import { openDatabaseConnection } from '../database/connection.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import type { ReadwiseBookInventoryItem, ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { normalizePersistedReadwiseBooksInventoryState } from './readwiseBooksInventoryStateCodec.js';
import { resolveReadwiseBookHighlightProgress } from './readwiseBookState.js';

const READWISE_BOOKS_INVENTORY_STATE_KEY = 'readwise_books_inventory_state';
const READWISE_BOOKS_INVENTORY_STATE_VERSION = 2;

type InventoryPaths = Pick<ReadwiseBooksInventory, 'fullDocumentDirectoryPath' | 'highlightDirectoryPath'>;

function createInventoryKey(paths: InventoryPaths) {
  return `${paths.fullDocumentDirectoryPath}\u001f${paths.highlightDirectoryPath}`;
}

function normalizeState(value: unknown) {
  return normalizePersistedReadwiseBooksInventoryState(value, READWISE_BOOKS_INVENTORY_STATE_VERSION);
}

function resolveGeneratedNodeId(book: ReadwiseBookInventoryItem, persistedBook?: ReadwiseBookInventoryItem) {
  if (!persistedBook?.generatedNodeId) {
    return book.generatedNodeId;
  }
  if (!hasActiveNode(persistedBook.generatedNodeId)) {
    return book.generatedNodeId;
  }
  return !book.generatedNodeId || book.generatedNodeId === buildReadwiseBookPlaceholderNodeId(book.bookKey)
    ? persistedBook.generatedNodeId
    : book.generatedNodeId;
}

function isSameBookState(left: ReadwiseBookInventoryItem, right: ReadwiseBookInventoryItem) {
  return (
    left.annotationStatus === right.annotationStatus &&
    left.bodyState === right.bodyState &&
    left.downloadUrl === right.downloadUrl &&
    left.epubPath === right.epubPath &&
    left.epubStatus === right.epubStatus &&
    left.fullDocumentMarkdownPath === right.fullDocumentMarkdownPath &&
    left.generatedNodeId === right.generatedNodeId &&
    left.highlightState === right.highlightState &&
    left.highlightMarkdownPath === right.highlightMarkdownPath &&
    left.highlightUnmatchedCount === right.highlightUnmatchedCount &&
    left.importStatus === right.importStatus &&
    left.metadataFrontmatter === right.metadataFrontmatter &&
    left.nodeStatus === right.nodeStatus &&
    left.summary === right.summary &&
    left.title === right.title
  );
}

function moveBookToTop(inventory: ReadwiseBooksInventory, bookKey: string) {
  const target = inventory.books.find((book) => book.bookKey === bookKey);
  if (!target) {
    return inventory;
  }
  return {
    ...inventory,
    books: [target, ...inventory.books.filter((book) => book.bookKey !== bookKey)]
  } satisfies ReadwiseBooksInventory;
}

function hasActiveNode(nodeId: string) {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ id: string }>(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL',
    [nodeId]
  );
  return Boolean(row?.id);
}

export function loadPersistedReadwiseBooksInventory(paths: InventoryPaths) {
  const state = normalizeState(loadJsonSetting(READWISE_BOOKS_INVENTORY_STATE_KEY));
  return state.inventories[createInventoryKey(paths)] ?? null;
}

export function findPersistedReadwiseBookByNodeId(nodeId: string) {
  const state = normalizeState(loadJsonSetting(READWISE_BOOKS_INVENTORY_STATE_KEY));
  for (const inventory of Object.values(state.inventories)) {
    const book = inventory.books.find((candidate) => candidate.generatedNodeId === nodeId);
    if (book) {
      return { book, inventory };
    }
  }
  return null;
}

export function mergePersistedReadwiseBooksInventory(input: {
  currentInventory: ReadwiseBooksInventory;
}) {
  const persistedInventory = loadPersistedReadwiseBooksInventory(input.currentInventory);
  if (!persistedInventory) {
    return input.currentInventory;
  }

  const changedBookKeys: string[] = [];
  const currentBookOrder = input.currentInventory.books.map((book) => book.bookKey);
  const mergedBooks = new Map(
    input.currentInventory.books.map((book) => {
      const persistedBook = persistedInventory.books.find((candidate) => candidate.bookKey === book.bookKey);
      const generatedNodeId = resolveGeneratedNodeId(book, persistedBook);
      const nodeStatus = generatedNodeId && hasActiveNode(generatedNodeId) ? 'generated' : 'missing';
      const importStatus =
        nodeStatus === 'generated' && (book.importStatus === 'completed' || persistedBook?.importStatus === 'completed')
          ? 'completed'
          : 'pending';
      const mergedBook = {
        ...book,
        bodyState: importStatus === 'completed' ? 'loaded' : 'unloaded',
        downloadUrl: book.downloadUrl ?? persistedBook?.downloadUrl ?? null,
        epubPath: book.epubPath ?? persistedBook?.epubPath ?? null,
        epubStatus: book.epubPath || persistedBook?.epubPath ? 'received' : 'missing',
        generatedNodeId,
        importStatus,
        nodeStatus,
        ...resolveReadwiseBookHighlightProgress(book, persistedBook)
      } satisfies ReadwiseBookInventoryItem;
      if (!persistedBook || !isSameBookState(mergedBook, persistedBook)) {
        changedBookKeys.push(book.bookKey);
      }
      return [
        book.bookKey,
        mergedBook
      ] as const;
    })
  );

  const changedBookKeySet = new Set(changedBookKeys);
  const orderedKeys = [
    ...changedBookKeys,
    ...persistedInventory.books
      .map((book) => book.bookKey)
      .filter((bookKey) => mergedBooks.has(bookKey) && !changedBookKeySet.has(bookKey)),
    ...currentBookOrder.filter((bookKey) => mergedBooks.has(bookKey) && !changedBookKeySet.has(bookKey)),
    ...Array.from(mergedBooks.keys())
  ].filter((bookKey, index, list) => list.indexOf(bookKey) === index);

  return {
    ...input.currentInventory,
    books: orderedKeys.map((bookKey) => mergedBooks.get(bookKey)).filter((book): book is ReadwiseBookInventoryItem => Boolean(book))
  } satisfies ReadwiseBooksInventory;
}

export function savePersistedReadwiseBooksInventory(inventory: ReadwiseBooksInventory) {
  const state = normalizeState(loadJsonSetting(READWISE_BOOKS_INVENTORY_STATE_KEY));
  saveJsonSetting(
    READWISE_BOOKS_INVENTORY_STATE_KEY,
    {
      ...state,
      inventories: {
        ...state.inventories,
        [createInventoryKey(inventory)]: inventory
      }
    },
    inventory.scannedAt
  );
}

export function savePersistedReadwiseBookMovedToTop(inventory: ReadwiseBooksInventory, bookKey: string) {
  savePersistedReadwiseBooksInventory(moveBookToTop(inventory, bookKey));
}

export function clearPersistedReadwiseBookGeneratedNodes(nodeIds: Set<string>, updatedAt = new Date().toISOString()) {
  if (nodeIds.size === 0) {
    return;
  }
  const state = normalizeState(loadJsonSetting(READWISE_BOOKS_INVENTORY_STATE_KEY));
  let changed = false;
  const inventories = Object.fromEntries(
    Object.entries(state.inventories).map(([key, inventory]) => [
      key,
      {
        ...inventory,
        books: inventory.books.map((book) => {
          if (!book.generatedNodeId || !nodeIds.has(book.generatedNodeId)) {
            return book;
          }
          changed = true;
          return {
            ...book,
            bodyState: 'unloaded' as const,
            generatedNodeId: null,
            importStatus: 'pending' as const,
            nodeStatus: 'missing' as const
          };
        }),
        scannedAt: updatedAt
      }
    ])
  );
  if (changed) {
    saveJsonSetting(READWISE_BOOKS_INVENTORY_STATE_KEY, { ...state, inventories }, updatedAt);
  }
}
