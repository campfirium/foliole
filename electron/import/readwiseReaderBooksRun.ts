import type { ImportManagerSourceDraft, ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { throwIfKeepImportAborted } from './keepImportProgress.js';
import { syncReadwiseBookPolicyProjection } from './readwiseBookPolicyProjection.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';

export type EnabledReadwiseBooksSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };
type ReadwiseBook = ReadwiseBooksInventory['books'][number];

function isSameBook(left: ReadwiseBook, right: ReadwiseBook) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function countChangedBooks(inventory: ReadwiseBooksInventory, previous: ReadwiseBooksInventory | null) {
  if (!previous) return inventory.books.length;
  const previousByKey = new Map(previous.books.map((book) => [book.bookKey, book]));
  return inventory.books.filter((book) => {
    const previousBook = previousByKey.get(book.bookKey);
    return !previousBook || !isSameBook(book, previousBook);
  }).length;
}

export async function runReadwiseBooksSource(
  source: EnabledReadwiseBooksSource,
  readwiseConfig: ReadwiseReaderConfig,
  policy: ReadwiseAutoImportPolicy,
  options?: { forceScan?: boolean; signal?: AbortSignal }
) {
  throwIfKeepImportAborted(options?.signal);
  const result = await loadReadwiseBooksInventoryForPaths({
    ...(options?.forceScan === undefined ? {} : { forceScan: options.forceScan }),
    fullDocumentDirectoryPath: source.primaryPath,
    highlightDirectoryPath: source.highlightPath,
    readwiseConfig
  });
  throwIfKeepImportAborted(options?.signal);
  const synced = await syncReadwiseBookPolicyProjection(source, result.inventory, policy);
  return {
    entryCount: synced.inventory.books.length,
    importedCount: result.sourceChanged
      ? countChangedBooks(synced.inventory, result.previousInventory)
      : synced.createdCount
  };
}
