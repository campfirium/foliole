import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';
import { shouldPrepareReadwiseApiEpubImages } from './readwiseApiMaterialization.js';

export async function prepareReadwiseApiEpubImagesIfNeeded(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  destination: ReadwiseImportDestination;
  document: PreparedReadwiseApiDocument;
  forceEpubStructure?: boolean;
  forceInbox?: boolean;
}) {
  return shouldPrepareReadwiseApiEpubImages(input)
    ? prepareReadwiseApiEpubImages(input.document)
    : null;
}
