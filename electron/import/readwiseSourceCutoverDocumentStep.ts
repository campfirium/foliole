import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { loadReadwiseApiFrozenResources, saveReadwiseApiFrozenResources } from '../database/readwiseApiFrozenResourceStage.js';

import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';
import { prepareReadwiseApiEpubCover } from './readwiseApiEpubCover.js';
import {
  prepareReadwiseApiEpubCoverIfNeeded,
  prepareReadwiseApiEpubImagesIfNeeded
} from './readwiseApiEpubImagePreparation.js';
import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';

export async function prepareReadwiseCutoverResources(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  destination: Exclude<ReadwiseImportDestination, 'off'>;
  document: PreparedReadwiseApiDocument;
  rebuildBook: boolean;
}) {
  const frozen = loadReadwiseApiFrozenResources(input.connectionRef, input.document.id);
  if (frozen?.cutoverBodySource === 'reader_html' && !frozen.preparationPending) return frozen;
  const preparation = { ...input, forceEpubStructure: input.rebuildBook };
  const prepareReaderBook = input.rebuildBook && input.document.category === 'epub';
  const [epubCover, epubImages] = await Promise.all([
    prepareReaderBook
      ? prepareReadwiseApiEpubCover(input.document)
      : prepareReadwiseApiEpubCoverIfNeeded(preparation),
    prepareReaderBook
      ? prepareReadwiseApiEpubImages(input.document)
      : prepareReadwiseApiEpubImagesIfNeeded(preparation)
  ]);
  const resources: ReadwiseApiPreparedResources = {
    cutoverBodySource: 'reader_html', epubCover, epubImages,
    forceEpubStructure: input.rebuildBook, originalFile: null
  };
  saveReadwiseApiFrozenResources(input.connectionRef, input.document.id, resources);
  return resources;
}

export function readwiseCutoverDocumentFailureReason(error: unknown) {
  if (!(error instanceof Error)) return 'request_failed';
  return error.message.trim().slice(0, 240) || 'request_failed';
}
