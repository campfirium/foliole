import type {
  ImportManagerSourceDraft,
  ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { throwIfKeepImportAborted } from './keepImportProgress.js';
import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';
import { savePersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';

export type EnabledReadwiseBooksSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

type ReadwiseBook = ReadwiseBooksInventory['books'][number];
const INBOX_NODE_ID = 'special-inbox';

function isSameBook(left: ReadwiseBook, right: ReadwiseBook) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function countChangedBooks(
  inventory: ReadwiseBooksInventory,
  previous: ReadwiseBooksInventory | null
) {
  if (!previous) {
    return inventory.books.length;
  }
  const previousByKey = new Map(previous.books.map((book) => [book.bookKey, book]));
  return inventory.books.filter((book) => {
    const previousBook = previousByKey.get(book.bookKey);
    return !previousBook || !isSameBook(book, previousBook);
  }).length;
}

function upsertReadwiseBookPlaceholder(book: ReadwiseBook, updatedAt: string) {
  const nodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  const updatedBook = {
    ...book,
    bodyState: 'unloaded',
    generatedNodeId: nodeId,
    importStatus: 'pending',
    nodeStatus: 'generated'
  } satisfies ReadwiseBook;

  upsertNodeSnapshot({
    anchorLink: null,
    content: buildReadwiseBookPlaceholderContent(updatedBook),
    createdAt: updatedAt,
    hideTitleHeading: false,
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    openingText: null,
    parentNodeId: INBOX_NODE_ID,
    position: null,
    reveal: null,
    title: updatedBook.title,
    updatedAt
  });
  return updatedBook;
}

function syncReadwiseBookPlaceholders(inventory: ReadwiseBooksInventory) {
  const updatedAt = new Date().toISOString();
  let createdCount = 0;
  const books = inventory.books.map((book) => {
    if (book.generatedNodeId) {
      return book;
    }
    createdCount += 1;
    return upsertReadwiseBookPlaceholder(book, updatedAt);
  });
  const updatedInventory = createdCount > 0 ? { ...inventory, books, scannedAt: updatedAt } : inventory;
  if (createdCount > 0) {
    savePersistedReadwiseBooksInventory(updatedInventory);
  }
  return { createdCount, inventory: updatedInventory };
}

export async function runReadwiseBooksSource(
  source: EnabledReadwiseBooksSource,
  readwiseConfig: ReadwiseReaderConfig,
  signal?: AbortSignal
) {
  throwIfKeepImportAborted(signal);
  const paths = {
    fullDocumentDirectoryPath: source.primaryPath,
    highlightDirectoryPath: source.highlightPath
  };
  const result = await loadReadwiseBooksInventoryForPaths({
    ...paths,
    readwiseConfig
  });
  throwIfKeepImportAborted(signal);
  const synced = syncReadwiseBookPlaceholders(result.inventory);
  return {
    entryCount: synced.inventory.books.length,
    importedCount: result.sourceChanged
      ? countChangedBooks(synced.inventory, result.previousInventory)
      : synced.createdCount
  };
}
