import type {
  ImportManagerSourceDraft,
  ReadwiseSourceKind
} from '../../lib/core/import/importManagerSettings.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { throwIfKeepImportAborted } from './keepImportProgress.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { savePersistedReadwiseBooksInventory } from './readwiseBooksInventoryState.js';

export type EnabledReadwiseBooksSource = ImportManagerSourceDraft & { kind: ReadwiseSourceKind };

export async function runReadwiseBooksSource(
  source: EnabledReadwiseBooksSource,
  readwiseConfig: ReadwiseReaderConfig,
  signal?: AbortSignal
) {
  throwIfKeepImportAborted(signal);
  const inventory = await scanReadwiseBooksInventory({
    fullDocumentDirectoryPath: source.primaryPath,
    highlightDirectoryPath: source.highlightPath,
    readwiseConfig
  });
  throwIfKeepImportAborted(signal);
  savePersistedReadwiseBooksInventory(inventory);
  return {
    entryCount: inventory.books.length,
    importedCount: inventory.books.length
  };
}
