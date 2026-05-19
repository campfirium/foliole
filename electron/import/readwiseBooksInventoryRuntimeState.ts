import type {
  ReadwiseBookInventoryItem,
  ReadwiseBooksInventory,
  ReadwiseBooksSourceSignature
} from './readwiseBooksInventory.js';
import {
  resolveGeneratedNodeId,
  resolveImportStatus
} from './readwiseBooksInventoryDatabase.js';

function resolveBookSourceName(book: ReadwiseBookInventoryItem) {
  const sourcePath = book.fullDocumentMarkdownPath ?? book.highlightMarkdownPath ?? book.epubPath;
  return sourcePath ? sourcePath.split(/[\\/]/u).at(-1) ?? `${book.title}.md` : `${book.title}.md`;
}

function refreshBookRuntimeState(book: ReadwiseBookInventoryItem) {
  const lookup = {
    epubPath: book.epubPath,
    fullDocumentMarkdownPath: book.fullDocumentMarkdownPath,
    highlightMarkdownPath: book.highlightMarkdownPath,
    sourceName: resolveBookSourceName(book)
  };
  const generatedNodeId = resolveGeneratedNodeId(lookup);
  const nodeStatus = generatedNodeId ? 'generated' : 'missing';
  const sourceImportStatus = resolveImportStatus(lookup);
  const importStatus =
    nodeStatus === 'generated' && (sourceImportStatus === 'completed' || book.importStatus === 'completed')
      ? 'completed'
      : 'pending';
  return {
    ...book,
    bodyState: importStatus === 'completed' ? 'loaded' : 'unloaded',
    generatedNodeId,
    importStatus,
    nodeStatus
  } satisfies ReadwiseBookInventoryItem;
}

export function refreshPersistedReadwiseBooksInventoryRuntimeState(
  inventory: ReadwiseBooksInventory,
  sourceSignature: ReadwiseBooksSourceSignature
) {
  return {
    ...inventory,
    books: inventory.books.map(refreshBookRuntimeState),
    sourceSignature
  } satisfies ReadwiseBooksInventory;
}
