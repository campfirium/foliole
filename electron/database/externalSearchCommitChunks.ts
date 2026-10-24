import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { runWithDatabaseConnectionOwner } from './connection.js';
import { markExternalDocumentsMissing, upsertExternalDocuments } from './externalDocuments.js';
import type { ExternalSearchWorkContext, ScannedDocument } from './externalSearchCacheSupport.js';

export const EXTERNAL_SEARCH_DOCUMENT_CHUNK_SIZE = 25;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

function toChunks<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * Writes a folder's changed documents into the library in short transactions of whole documents,
 * releasing the database and the event loop between them. Callers commit the scan cache only after
 * this finishes, so an interrupted run is picked up again by the next refresh.
 */
export async function commitExternalDocumentChunks(input: {
  assertFolderConfigured: () => void;
  context?: ExternalSearchWorkContext;
  deletedRelativePaths: string[];
  documentChunkSize?: number;
  documents: ScannedDocument[];
  folder: NativeExternalSearchFolder;
  indexedAt: string;
}) {
  const size = input.documentChunkSize ?? EXTERNAL_SEARCH_DOCUMENT_CHUNK_SIZE;
  const writes = [
    ...toChunks(input.documents, size).map((chunk) => () =>
      upsertExternalDocuments(input.folder, chunk, input.indexedAt)),
    ...toChunks(input.deletedRelativePaths, size).map((chunk) => () =>
      markExternalDocumentsMissing(chunk.map((relativePath) => ({ relativePath })), input.folder.id, input.indexedAt))
  ];
  for (const write of writes) {
    await runWithDatabaseConnectionOwner(() => {
      input.assertFolderConfigured();
      write();
    });
    await (input.context?.yieldIfNeeded ?? yieldToEventLoop)();
  }
}
