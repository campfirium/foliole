import { useCallback, useEffect, useState } from 'react';

import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../../lib/platform/nativeReadwiseContract';
import {
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload,
  type RuntimeReadwiseBookEpubProgressEvent,
  type RuntimeReadwiseBookInventoryItem
} from '../../shared/platform/readwiseBooksRuntimeRepository';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function isReadwiseOriginalFileLoaded(book: RuntimeReadwiseBookInventoryItem | null) {
  return book?.epubStatus === 'received' || book?.bodyState === 'loaded' || book?.importStatus === 'completed';
}

function resolveBook(activeNodeId: string, books: RuntimeReadwiseBookInventoryItem[]) {
  return books.find((book) => book.generatedNodeId === activeNodeId) ?? null;
}

function getBookLabel(book: RuntimeReadwiseBookInventoryItem | null, title: string | null) {
  return title?.trim() || book?.title || 'this book';
}

function formatDownloadMessage(
  result: NativeReadwiseBookDownloadResult | null,
  book: RuntimeReadwiseBookInventoryItem | null
) {
  const label = getBookLabel(book, result?.title ?? null);
  if (!result || result.status === 'book_not_found') return 'This topic is not available for original file actions right now.';
  if (result.status === 'missing_link') return `No original file download link was found for ${label}.`;
  if (result.status === 'blocked_secondary') return 'Readwise actions run on the current primary device.';
  return `Opened the original file download for ${label}.`;
}

function formatLoadMessage(result: NativeReadwiseBookEpubLoadResult | null, book: RuntimeReadwiseBookInventoryItem | null) {
  const label = getBookLabel(book, result?.title ?? null);
  if (!result || result.status === 'book_not_found') return 'This topic is not available for original file actions right now.';
  if (result.status === 'cancelled') return 'Load original file was cancelled.';
  if (result.status === 'failed') return result.error_message?.trim() || `Could not load an original file for ${label}.`;
  if (result.status === 'blocked_secondary') {
    return result.error_message?.trim() || 'Readwise actions run on the current primary device.';
  }
  return `Loaded an original file for ${label}.`;
}

function createIdleProgress() {
  return { detail: '', progress: 0 };
}

function useReadwiseBookInventory(activeNodeId: string | null) {
  const [book, setBook] = useState<RuntimeReadwiseBookInventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activeNodeId) {
      setBook(null);
      setIsLoading(false);
      return;
    }

    let isDisposed = false;
    setIsLoading(true);
    void loadRuntimeReadwiseBooksInventory().then((inventory) => {
      if (!isDisposed) setBook(resolveBook(activeNodeId, inventory?.books ?? []));
      if (!isDisposed) setIsLoading(false);
    });
    return () => {
      isDisposed = true;
    };
  }, [activeNodeId]);

  return { book, isLoading, setBook };
}

function useReadwiseBookLoadProgress(activeNodeId: string | null) {
  const [loadProgress, setLoadProgress] = useState(createIdleProgress);

  useEffect(() => {
    if (!activeNodeId) {
      setLoadProgress(createIdleProgress());
      return;
    }
    return (
      onRuntimeReadwiseBookEpubProgress((payload: RuntimeReadwiseBookEpubProgressEvent) => {
        if (payload.nodeId !== activeNodeId) return;
        setLoadProgress({ detail: payload.detail, progress: Math.max(0, Math.min(1, payload.progress)) });
      }) ?? undefined
    );
  }, [activeNodeId]);

  return { loadProgress, setLoadProgress };
}

export function useReadwiseBookActions(activeNodeId: string | null) {
  const { book, isLoading, setBook } = useReadwiseBookInventory(activeNodeId);
  const { loadProgress, setLoadProgress } = useReadwiseBookLoadProgress(activeNodeId);
  const [pendingAction, setPendingAction] = useState<'download' | 'load' | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    setPendingAction(null);
    setStatusMessage('');
  }, [activeNodeId]);

  const runDownload = useCallback(async () => {
    if (!activeNodeId) return;
    setPendingAction('download');
    const result = await openRuntimeReadwiseBookDownload(activeNodeId);
    setStatusMessage(formatDownloadMessage(result, book));
    setPendingAction(null);
  }, [activeNodeId, book]);

  const runLoad = useCallback(async () => {
    if (!activeNodeId) return;
    setPendingAction('load');
    setLoadProgress({ detail: 'Waiting for original file...', progress: 0.1 });
    try {
      const result = await loadRuntimeReadwiseBookEpub(activeNodeId);
      setStatusMessage(formatLoadMessage(result, book));
      if (result?.status === 'selected') {
        await useWorkspaceStore.persist.rehydrate();
        setBook((current) =>
          current
            ? { ...current, bodyState: 'loaded', epubStatus: 'received', importStatus: 'completed', nodeStatus: 'generated' }
            : current
        );
        setLoadProgress({ detail: 'Done.', progress: 1 });
      } else {
        setLoadProgress(createIdleProgress());
      }
    } finally {
      setPendingAction(null);
    }
  }, [activeNodeId, book, setBook, setLoadProgress]);

  return { book, isLoading, loadProgress, pendingAction, runDownload, runLoad, statusMessage };
}
