import { buildRawEpubBook as buildBook } from '../../lib/core/import/epub/epubImportBook.js';

import { EpubArchiveEntries } from './epubArchiveEntries.js';
import { stageEpubText } from './epubStagedContent.js';

/**
 * Parses an EPUB inside the parse process. That process runs as plain Node, so nothing reachable from here may
 * import Electron, including the runtime log the parent process writes.
 */
export async function buildRawEpubBook(filePath: string, sourceName: string, workingDirectory: string) {
  return buildBook(await EpubArchiveEntries.open(filePath, workingDirectory), sourceName,
    (object, fields) => stageEpubText(object, fields, workingDirectory));
}
