import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { prepareReadwiseApiEpubCover } from './readwiseApiEpubCover.js';
import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';
import { shouldPrepareReadwiseApiEpubImages } from './readwiseApiMaterialization.js';

type PreparationInput = {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  destination: ReadwiseImportDestination;
  document: PreparedReadwiseApiDocument;
  forceEpubStructure?: boolean;
  forceInbox?: boolean;
};

export async function prepareReadwiseApiEpubCoverIfNeeded(input: PreparationInput) {
  return shouldPrepareReadwiseApiEpubCover(input)
    ? prepareReadwiseApiEpubCover(input.document)
    : null;
}

export async function prepareReadwiseApiEpubImagesIfNeeded(input: PreparationInput) {
  return shouldPrepareReadwiseApiEpubImages(input)
    ? prepareReadwiseApiEpubImages(input.document)
    : null;
}

function shouldPrepareReadwiseApiEpubCover(input: PreparationInput) {
  if (input.document.category !== 'epub') return false;
  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  if (existing?.state.bodyAuthority === 'original_epub') return false;
  const materializesLocally = Boolean(input.forceInbox || existing || input.destination === 'inbox');
  return materializesLocally && (!existing || Boolean(input.forceEpubStructure));
}
