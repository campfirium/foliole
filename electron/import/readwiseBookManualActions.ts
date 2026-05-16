import { shell, type BrowserWindow } from 'electron';

import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import type {
  NativeReadwiseBookEpubProgressEvent,
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';
import { runEpubImport } from '../ipc/epubImport.js';
import { resolveSingleFileImportSource } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { saveRecentReadwiseBookEpubDirectory, selectReadwiseBookEpubPath } from './readwiseBookEpubPicker.js';
import { placeReadwiseBookHighlights } from './readwiseBookHighlightPlacement.js';
import { buildReadwiseBookPlaceholderContent, buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';
import { loadReadwiseBooksInventory, type ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';
import {
  findPersistedReadwiseBookByNodeId,
  savePersistedReadwiseBookMovedToTop
} from './readwiseBooksInventoryState.js';
import { applyReadwiseBookPlacementState } from './readwiseBookState.js';
import {
  canRunReadwiseExternalSource,
  createBlockedReadwiseBookDownloadResult,
  createBlockedReadwiseBookEpubResult,
  createReadwiseBookEpubFailureResult
} from './readwiseExternalSourceGuard.js';

function buildReadwiseBookEpubSourceIdentity(bookKey: string) {
  return `readwise/books/${bookKey}`;
}

async function loadBookByNodeId(nodeId: string) {
  const inventory = await loadReadwiseBooksInventory();
  const book =
    inventory.books.find(
      (candidate) =>
        candidate.generatedNodeId === nodeId || buildReadwiseBookPlaceholderNodeId(candidate.bookKey) === nodeId
    ) ?? null;
  if (book) {
    return { book, inventory };
  }
  return findPersistedReadwiseBookByNodeId(nodeId) ?? { book: null, inventory };
}

function refreshPlaceholderNode(book: ReadwiseBookInventoryItem) {
  const placeholderNodeId = buildReadwiseBookPlaceholderNodeId(book.bookKey);
  if (book.generatedNodeId !== placeholderNodeId) {
    return;
  }
  openDatabaseConnection().sqlite
    .prepare('UPDATE nodes SET content = ?, opening_text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(
      buildReadwiseBookPlaceholderContent(book),
      null,
      new Date().toISOString(),
      placeholderNodeId
    );
  syncWorkspaceSearchIndexForNodeIds(openDatabaseConnection().driver, [placeholderNodeId]);
}

export async function openReadwiseBookDownload(nodeId: string): Promise<NativeReadwiseBookDownloadResult> {
  const { book } = await loadBookByNodeId(nodeId);
  if (!book) {
    return { book_key: null, status: 'book_not_found', title: null, url: null };
  }
  if (!canRunReadwiseExternalSource({ readwiseReaderEnabled: loadImportManagerSettings().readwiseReaderConfig.enabled })) {
    return createBlockedReadwiseBookDownloadResult(book);
  }

  const url = book.downloadUrl?.trim() ?? '';
  if (!url) {
    return { book_key: book.bookKey, status: 'missing_link', title: book.title, url: null };
  }

  await shell.openExternal(url);
  return { book_key: book.bookKey, status: 'opened', title: book.title, url };
}

async function importSelectedReadwiseBookEpub(input: {
  book: ReadwiseBookInventoryItem;
  epubPath: string;
  inventory: Awaited<ReturnType<typeof loadBookByNodeId>>['inventory'];
  onBeforeHighlightPlacement?: () => void;
  targetNodeId: string;
}) {
  saveRecentReadwiseBookEpubDirectory(input.epubPath);
  const importedAt = new Date().toISOString();
  const imported = await runEpubImport(resolveSingleFileImportSource(input.epubPath), importedAt, {
    sourceIdentity: buildReadwiseBookEpubSourceIdentity(input.book.bookKey),
    sourceTrackingMode: 'tracked',
    targetNodeId: input.targetNodeId
  });
  const generatedNodeId = imported.nodeId || input.targetNodeId || input.book.generatedNodeId;
  input.onBeforeHighlightPlacement?.();
  const placement = await placeReadwiseBookHighlights({
    highlightMarkdownPath: input.book.highlightMarkdownPath,
    importedAt,
    readwiseConfig: loadImportManagerSettings().readwiseReaderConfig,
    rootNodeId: generatedNodeId
  });
  const updatedBook = applyReadwiseBookPlacementState({
    ...input.book,
    epubPath: input.epubPath,
    epubStatus: 'received',
    generatedNodeId,
    importStatus: generatedNodeId ? 'completed' : input.book.importStatus,
    nodeStatus: generatedNodeId ? 'generated' : input.book.nodeStatus
  } satisfies ReadwiseBookInventoryItem, placement);
  const updatedInventory = {
    ...input.inventory,
    books: input.inventory.books.map((candidate) => (candidate.bookKey === input.book.bookKey ? updatedBook : candidate)),
    scannedAt: new Date().toISOString()
  };

  savePersistedReadwiseBookMovedToTop(updatedInventory, updatedBook.bookKey);
  refreshPlaceholderNode(updatedBook);
  return updatedBook;
}

function publishReadwiseBookEpubProgress(
  window: BrowserWindow | null,
  payload: NativeReadwiseBookEpubProgressEvent
) {
  if (!window || window.isDestroyed()) {
    return;
  }
  window.webContents.send(IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL, {
    detail: payload.detail,
    nodeId: payload.node_id,
    phase: payload.phase,
    progress: payload.progress
  });
}

async function importReadwiseBookEpubWithProgress(input: {
  book: ReadwiseBookInventoryItem;
  epubPath: string;
  inventory: Awaited<ReturnType<typeof loadBookByNodeId>>['inventory'];
  nodeId: string;
  window: BrowserWindow | null;
}) {
  publishReadwiseBookEpubProgress(input.window, {
    detail: 'Importing EPUB…',
    node_id: input.nodeId,
    phase: 'importing_epub',
    progress: 0.35
  });
  const updatedBook = await importSelectedReadwiseBookEpub({
    book: input.book,
    epubPath: input.epubPath,
    inventory: input.inventory,
    targetNodeId: input.nodeId,
    onBeforeHighlightPlacement: () => {
      publishReadwiseBookEpubProgress(input.window, {
        detail: 'Placing highlights…',
        node_id: input.nodeId,
        phase: 'placing_highlights',
        progress: 0.8
      });
    }
  });
  publishReadwiseBookEpubProgress(input.window, {
    detail: 'Done.',
    node_id: input.nodeId,
    phase: 'completed',
    progress: 1
  });
  return updatedBook;
}

export async function loadReadwiseBookEpub(
  nodeId: string,
  window: BrowserWindow | null = null
): Promise<NativeReadwiseBookEpubLoadResult> {
  const { book, inventory } = await loadBookByNodeId(nodeId);
  if (!book) {
    return { book_key: null, epub_path: null, status: 'book_not_found', title: null };
  }
  if (!canRunReadwiseExternalSource({ readwiseReaderEnabled: loadImportManagerSettings().readwiseReaderConfig.enabled })) {
    return createBlockedReadwiseBookEpubResult(book);
  }

  const epubPath = await selectReadwiseBookEpubPath(book, window);
  if (!epubPath) {
    return { book_key: book.bookKey, epub_path: null, status: 'cancelled', title: book.title };
  }

  try {
    const updatedBook = await importReadwiseBookEpubWithProgress({
      book,
      epubPath,
      inventory,
      nodeId,
      window
    });
    return {
      book_key: updatedBook.bookKey,
      epub_path: updatedBook.epubPath,
      status: 'selected',
      title: updatedBook.title
    };
  } catch (error) {
    console.error('[readwise-books] load epub failed', {
      bookKey: book.bookKey,
      epubPath,
      error
    });
    publishReadwiseBookEpubProgress(window, {
      detail: 'Load EPUB failed.',
      node_id: nodeId,
      phase: 'failed',
      progress: 1
    });
    return createReadwiseBookEpubFailureResult(book);
  }
}
