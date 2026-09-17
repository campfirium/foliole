import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { saveReadwiseApiFrozenResources } from '../database/readwiseApiFrozenResourceStage.js';

import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';
import { prepareDeferredReadwiseApiEpubCover } from './readwiseApiEpubCover.js';

export async function prepareReadwiseCutoverResources(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  destination: Exclude<ReadwiseImportDestination, 'off'>;
  document: PreparedReadwiseApiDocument;
  rebuildBook: boolean;
}) {
  const resources: ReadwiseApiPreparedResources = {
    cutoverBodySource: 'reader_html',
    epubCover: prepareDeferredReadwiseApiEpubCover(input.document),
    epubImages: null,
    forceEpubStructure: input.rebuildBook, originalFile: null
  };
  saveReadwiseApiFrozenResources(input.connectionRef, input.document.id, resources);
  return resources;
}

export function readwiseCutoverDocumentFailureReason(error: unknown) {
  if (!(error instanceof Error)) return 'request_failed';
  return error.message.trim().slice(0, 240) || 'request_failed';
}
