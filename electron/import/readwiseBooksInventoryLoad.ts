import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { scanReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { refreshPersistedReadwiseBooksInventoryRuntimeState } from './readwiseBooksInventoryRuntimeState.js';
import {
  areReadwiseBooksSourceSignaturesEqual,
  discoverReadwiseBooksSourceSignature
} from './readwiseBooksInventorySignature.js';
import {
  loadPersistedReadwiseBooksInventory,
  savePersistedReadwiseBooksInventory
} from './readwiseBooksInventoryState.js';
import { canRunReadwiseExternalSource } from './readwiseExternalSourceGuard.js';

export async function loadReadwiseBooksInventoryForPaths(input: {
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
  readwiseConfig: ReadwiseReaderConfig;
}) {
  const previousInventory = loadPersistedReadwiseBooksInventory(input);
  const sourceSignature = await discoverReadwiseBooksSourceSignature(input);
  if (areReadwiseBooksSourceSignaturesEqual(previousInventory?.sourceSignature, sourceSignature)) {
    const inventory = refreshPersistedReadwiseBooksInventoryRuntimeState(previousInventory!, sourceSignature);
    savePersistedReadwiseBooksInventory(inventory);
    return { inventory, previousInventory, sourceChanged: false };
  }
  const inventory = await scanReadwiseBooksInventory(input);
  savePersistedReadwiseBooksInventory(inventory);
  return { inventory, previousInventory, sourceChanged: true };
}

export async function loadReadwiseBooksInventory() {
  const settings = loadImportManagerSettings();
  const booksSource = settings.readwiseSources.find((source) => source.kind === 'books');
  const paths = {
    fullDocumentDirectoryPath: booksSource?.primaryPath.trim() ?? '',
    highlightDirectoryPath: booksSource?.highlightPath.trim() ?? ''
  };
  const canScanBooks =
    settings.readwiseReaderConfig.enabled &&
    booksSource?.keepState === 'enabled' &&
    canRunReadwiseExternalSource();
  if (!canScanBooks) {
    return { books: [], ...paths, scannedAt: new Date().toISOString() } satisfies ReadwiseBooksInventory;
  }
  return (await loadReadwiseBooksInventoryForPaths({
    ...paths,
    readwiseConfig: settings.readwiseReaderConfig
  })).inventory;
}
