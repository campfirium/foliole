import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import type { ReadwiseBookInventoryItem, ReadwiseBooksInventory } from './readwiseBooksInventory.js';

const READWISE_BOOKS_INVENTORY_STATE_KEY = 'readwise_books_inventory_state';
const READWISE_BOOKS_INVENTORY_STATE_VERSION = 1;

type InventoryPaths = Pick<ReadwiseBooksInventory, 'fullDocumentDirectoryPath' | 'highlightDirectoryPath'>;

interface PersistedReadwiseBooksInventoryState {
  inventories: Record<string, ReadwiseBooksInventory>;
  version: number;
}

function createInventoryKey(paths: InventoryPaths) {
  return `${paths.fullDocumentDirectoryPath}\u001f${paths.highlightDirectoryPath}`;
}

function isBookInventoryItem(value: unknown): value is ReadwiseBookInventoryItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ReadwiseBookInventoryItem>;
  return (
    typeof candidate.annotationStatus === 'string' &&
    typeof candidate.bookKey === 'string' &&
    (typeof candidate.downloadUrl === 'string' || candidate.downloadUrl === null) &&
    (typeof candidate.epubPath === 'string' || candidate.epubPath === null) &&
    typeof candidate.epubStatus === 'string' &&
    (typeof candidate.fullDocumentMarkdownPath === 'string' || candidate.fullDocumentMarkdownPath === null) &&
    (typeof candidate.generatedNodeId === 'string' || candidate.generatedNodeId === null) &&
    (typeof candidate.highlightMarkdownPath === 'string' || candidate.highlightMarkdownPath === null) &&
    typeof candidate.importStatus === 'string' &&
    typeof candidate.nodeStatus === 'string' &&
    typeof candidate.title === 'string'
  );
}

function normalizeInventory(value: unknown): ReadwiseBooksInventory | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ReadwiseBooksInventory>;
  if (
    typeof candidate.fullDocumentDirectoryPath !== 'string' ||
    typeof candidate.highlightDirectoryPath !== 'string' ||
    typeof candidate.scannedAt !== 'string' ||
    !Array.isArray(candidate.books)
  ) {
    return null;
  }
  const books = candidate.books.filter(isBookInventoryItem);
  return {
    books,
    fullDocumentDirectoryPath: candidate.fullDocumentDirectoryPath,
    highlightDirectoryPath: candidate.highlightDirectoryPath,
    scannedAt: candidate.scannedAt
  };
}

function normalizeState(value: unknown): PersistedReadwiseBooksInventoryState {
  if (!value || typeof value !== 'object') {
    return { inventories: {}, version: READWISE_BOOKS_INVENTORY_STATE_VERSION };
  }
  const candidate = value as Partial<PersistedReadwiseBooksInventoryState>;
  const inventories = Object.entries(candidate.inventories ?? {}).reduce<Record<string, ReadwiseBooksInventory>>(
    (accumulator, [key, inventory]) => {
      const normalized = normalizeInventory(inventory);
      if (normalized) {
        accumulator[key] = normalized;
      }
      return accumulator;
    },
    {}
  );
  return {
    inventories,
    version: READWISE_BOOKS_INVENTORY_STATE_VERSION
  };
}

function resolveGeneratedNodeId(book: ReadwiseBookInventoryItem, persistedBook?: ReadwiseBookInventoryItem) {
  if (!persistedBook?.generatedNodeId) {
    return book.generatedNodeId;
  }
  return !book.generatedNodeId || book.generatedNodeId === buildReadwiseBookPlaceholderNodeId(book.bookKey)
    ? persistedBook.generatedNodeId
    : book.generatedNodeId;
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
  restoreMissingBooks: boolean;
}) {
  const persistedInventory = loadPersistedReadwiseBooksInventory(input.currentInventory);
  if (!persistedInventory) {
    return input.currentInventory;
  }

  const mergedBooks = new Map(
    input.currentInventory.books.map((book) => {
      const persistedBook = persistedInventory.books.find((candidate) => candidate.bookKey === book.bookKey);
      const generatedNodeId = resolveGeneratedNodeId(book, persistedBook);
      return [
        book.bookKey,
        {
          ...book,
          downloadUrl: book.downloadUrl ?? persistedBook?.downloadUrl ?? null,
          epubPath: book.epubPath ?? persistedBook?.epubPath ?? null,
          epubStatus: book.epubPath || persistedBook?.epubPath ? 'received' : 'missing',
          generatedNodeId,
          importStatus:
            book.importStatus === 'completed' || persistedBook?.importStatus === 'completed' ? 'completed' : 'pending',
          nodeStatus: generatedNodeId ? 'generated' : 'missing'
        } satisfies ReadwiseBookInventoryItem
      ] as const;
    })
  );

  if (input.restoreMissingBooks) {
    for (const book of persistedInventory.books) {
      if (!mergedBooks.has(book.bookKey)) {
        mergedBooks.set(book.bookKey, book);
      }
    }
  }

  return {
    ...input.currentInventory,
    books: [...mergedBooks.values()].sort((left, right) => left.title.localeCompare(right.title))
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
