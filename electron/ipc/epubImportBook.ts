import { buildRawEpubBook as buildBook } from '../../lib/core/import/epub/epubImportBook.js';

import { EpubArchiveEntries } from './epubArchiveEntries.js';
import { stageEpubText } from './epubStagedContent.js';
export type { RawEpubBook } from '../../lib/core/import/epub/epubImportBook.js';
export { readRawEpubBook, readRawEpubBookBytes } from './epubBookProcessClient.js';
export async function buildRawEpubBook(filePath: string, sourceName: string, workingDirectory: string) {
  return buildBook(await EpubArchiveEntries.open(filePath, workingDirectory), sourceName,
    (object, fields) => stageEpubText(object, fields, workingDirectory));
}
