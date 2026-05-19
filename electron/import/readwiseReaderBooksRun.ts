import type {
  ImportManagerSourceDraft,
  ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { throwIfKeepImportAborted } from './keepImportProgress.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';

export type EnabledReadwiseBooksSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

type ReadwiseBook = ReadwiseBooksInventory['books'][number];

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
  return {
    entryCount: result.inventory.books.length,
    importedCount: result.sourceChanged ? countChangedBooks(result.inventory, result.previousInventory) : 0
  };
}
