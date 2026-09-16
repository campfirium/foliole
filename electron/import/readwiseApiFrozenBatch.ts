import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  loadReadwiseApiFrozenResources,
  saveReadwiseApiFrozenResources
} from '../database/readwiseApiFrozenResourceStage.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';
import {
  prepareReadwiseApiEpubCoverIfNeeded,
  prepareReadwiseApiEpubImagesIfNeeded
} from './readwiseApiEpubImagePreparation.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import {
  prepareReadwiseApiOriginalFile,
  stageReadwiseApiOriginalFile
} from './readwiseApiOriginalFile.js';
import { shouldRebuildPristineReadwiseEpub } from './readwiseSourceCutoverMerge.js';

export async function prepareReadwiseApiFrozenResources(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  destination: ReadwiseImportDestination;
  document: PreparedReadwiseApiDocument;
  requireFreshOriginalFile?: boolean;
}): Promise<ReadwiseApiPreparedResources> {
  const frozen = loadReadwiseApiFrozenResources(input.connectionRef, input.document.id);
  if (frozen) return frozen;
  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  const destination = existing ? 'inbox' : input.destination;
  const forceEpubStructure = shouldRebuildPristineReadwiseEpub({
    connectionRef: input.connectionRef,
    document: input.document
  });
  const originalFileCategory = originalFileCategoryFor(input.document.category);
  const originalFile = originalFileCategory && destination === 'inbox'
    && (input.requireFreshOriginalFile || existing?.state.originalFile?.status !== 'localized')
    ? await prepareReadwiseApiOriginalFile({
      category: originalFileCategory,
      dependencies: input.dependencies,
      documentId: input.document.id,
      hasHtmlBody: Boolean(input.document.body.trim()),
      ...(input.document.rawSourceUrl === undefined ? {} : { rawSourceUrl: input.document.rawSourceUrl })
    })
    : null;
  const epubImages = await prepareReadwiseApiEpubImagesIfNeeded({
    config: input.config,
    connectionRef: input.connectionRef,
    destination,
    document: input.document,
    forceEpubStructure
  });
  const epubCover = await prepareReadwiseApiEpubCoverIfNeeded({
    config: input.config,
    connectionRef: input.connectionRef,
    destination,
    document: input.document,
    forceEpubStructure
  });
  if (originalFile?.bytes && originalFile.state.status === 'localized') {
    await stageReadwiseApiOriginalFile({
      bytes: originalFile.bytes,
      category: originalFileCategory ?? 'pdf',
      state: originalFile.state,
      title: input.document.title
    });
  }
  const resources: ReadwiseApiPreparedResources = {
    epubCover,
    epubImages,
    forceEpubStructure,
    originalFile: originalFile ? { bytes: null, state: originalFile.state } : null,
    ...(input.requireFreshOriginalFile ? { replaceOriginalFile: true } : {})
  };
  assertFreshOriginalFile(input.requireFreshOriginalFile, originalFile);
  saveReadwiseApiFrozenResources(input.connectionRef, input.document.id, resources);
  return resources;
}

function originalFileCategoryFor(category: PreparedReadwiseApiDocument['category']) {
  return category === 'pdf' || category === 'epub' ? category : null;
}

function assertFreshOriginalFile(
  required: boolean | undefined,
  originalFile: Awaited<ReturnType<typeof prepareReadwiseApiOriginalFile>> | null
) {
  if (required && originalFile?.state.status !== 'localized') {
    throw new Error(originalFile?.state.reason ?? 'original_file_download_failed');
  }
}
