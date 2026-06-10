import { shell, type BrowserWindow } from 'electron';

import { normalizeOpenExternalUrl } from '../../lib/platform/externalUrl.js';
import type {
  NativeReadwiseBookEpubProgressEvent,
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../lib/platform/nativeReadwiseContract.js';
import { IPC_READWISE_BOOK_EPUB_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { saveRecentReadwiseBookEpubDirectory, selectReadwiseBookEpubPath } from './readwiseBookEpubPicker.js';
import { placeReadwiseBookHighlights } from './readwiseBookHighlightPlacement.js';
import { refreshReadwiseBookPlaceholderNode } from './readwiseBookPlaceholderRefresh.js';
import { type ReadwiseBookInventoryItem, type ReadwiseBooksInventory } from './readwiseBooksInventory.js';
import { savePersistedReadwiseBookMovedToTop } from './readwiseBooksInventoryState.js';
import { applyReadwiseBookPlacementState } from './readwiseBookState.js';
import { canRunReadwiseExternalSource } from './readwiseExternalSourceGuard.js';
import {
  importSelectedReadwiseOriginalFileIntoNode,
  importSelectedReadwiseTopicFile
} from './readwiseOriginalFileImport.js';
import {
  createBlockedOriginalFileLoadResult,
  createCancelledOriginalFileLoadResult,
  createFailedOriginalFileLoadResult
} from './readwiseOriginalFileResults.js';
import {
  getReadwiseOriginalFileDownloadUrl,
  getReadwiseOriginalFileTargetKey,
  getReadwiseOriginalFileTargetTitle,
  loadReadwiseOriginalFileTarget
} from './readwiseOriginalFileTarget.js';

function buildReadwiseBookEpubSourceIdentity(bookKey: string) {
  return `readwise/books/${bookKey}`;
}

export async function openReadwiseBookDownload(nodeId: string): Promise<NativeReadwiseBookDownloadResult> {
  const target = await loadReadwiseOriginalFileTarget(nodeId);
  if (!target) {
    return { book_key: null, status: 'book_not_found', title: null, url: null };
  }
  if (!canRunReadwiseExternalSource({ readwiseReaderEnabled: loadImportManagerSettings().readwiseReaderConfig.enabled })) {
    return {
      book_key: getReadwiseOriginalFileTargetKey(target),
      status: 'blocked_secondary',
      title: getReadwiseOriginalFileTargetTitle(target),
      url: null
    };
  }

  const url = normalizeOpenExternalUrl(getReadwiseOriginalFileDownloadUrl(target) ?? '') ?? '';
  if (!url) {
    return {
      book_key: getReadwiseOriginalFileTargetKey(target),
      status: 'missing_link',
      title: getReadwiseOriginalFileTargetTitle(target),
      url: null
    };
  }

  await shell.openExternal(url);
  return { book_key: getReadwiseOriginalFileTargetKey(target), status: 'opened', title: getReadwiseOriginalFileTargetTitle(target), url };
}

async function importSelectedReadwiseBookEpub(input: {
  book: ReadwiseBookInventoryItem;
  epubPath: string;
  inventory: ReadwiseBooksInventory;
  onBeforeHighlightPlacement?: () => void;
  targetNodeId: string;
}) {
  saveRecentReadwiseBookEpubDirectory(input.epubPath);
  const imported = await importSelectedReadwiseOriginalFileIntoNode({
    filePath: input.epubPath,
    nodeId: input.targetNodeId,
    sourceIdentity: buildReadwiseBookEpubSourceIdentity(input.book.bookKey),
    title: input.book.title
  });
  const generatedNodeId = imported.nodeId || input.targetNodeId || input.book.generatedNodeId;
  input.onBeforeHighlightPlacement?.();
  const placement = await placeReadwiseBookHighlights({
    highlightMarkdownPath: input.book.highlightMarkdownPath,
    importedAt: imported.importedAt,
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
  refreshReadwiseBookPlaceholderNode(updatedBook);
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
  inventory: ReadwiseBooksInventory;
  nodeId: string;
  window: BrowserWindow | null;
}) {
  publishReadwiseBookEpubProgress(input.window, {
    detail: 'Importing original file…',
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
  const target = await loadReadwiseOriginalFileTarget(nodeId);
  if (!target) {
    return { book_key: null, epub_path: null, status: 'book_not_found', title: null };
  }
  if (!canRunReadwiseExternalSource({ readwiseReaderEnabled: loadImportManagerSettings().readwiseReaderConfig.enabled })) {
    return createBlockedOriginalFileLoadResult(target);
  }

  const selectedPath = await selectReadwiseBookEpubPath(target.kind === 'book' ? target.book : null, window);
  if (!selectedPath) {
    return createCancelledOriginalFileLoadResult(target);
  }

  try {
    const updatedBook =
      target.kind === 'book'
        ? await importReadwiseBookEpubWithProgress({
            book: target.book,
            epubPath: selectedPath,
            inventory: target.inventory,
            nodeId,
            window
          })
        : null;
    if (target.kind === 'topic') {
      await importSelectedReadwiseTopicFile({ filePath: selectedPath, target });
    }
    return {
      book_key: updatedBook?.bookKey ?? getReadwiseOriginalFileTargetKey(target),
      epub_path: updatedBook?.epubPath ?? selectedPath,
      status: 'selected',
      title: updatedBook?.title ?? getReadwiseOriginalFileTargetTitle(target)
    };
  } catch (error) {
    console.error('[readwise-books] load original file failed', {
      bookKey: getReadwiseOriginalFileTargetKey(target),
      selectedPath,
      error
    });
    publishReadwiseBookEpubProgress(window, {
      detail: 'Load original file failed.',
      node_id: nodeId,
      phase: 'failed',
      progress: 1
    });
    return createFailedOriginalFileLoadResult(target);
  }
}
