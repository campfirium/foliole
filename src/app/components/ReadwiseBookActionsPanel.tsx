import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../../lib/platform/nativeReadwiseContract';
import {
  loadRuntimeReadwiseBookEpub,
  loadRuntimeReadwiseBooksInventory,
  openRuntimeReadwiseBookDownload,
  type RuntimeReadwiseBookInventoryItem
} from '../../shared/platform/readwiseBooksBridge';
import { AppButton } from '../../shared/ui';

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
  if (!result || result.status === 'book_not_found') {
    return 'This book is not available for manual EPUB actions right now.';
  }
  if (result.status === 'missing_link') {
    return `No EPUB download link was found for ${label}.`;
  }
  return `Opened the EPUB download for ${label}.`;
}

function formatLoadMessage(result: NativeReadwiseBookEpubLoadResult | null, book: RuntimeReadwiseBookInventoryItem | null) {
  const label = getBookLabel(book, result?.title ?? null);
  if (!result || result.status === 'book_not_found') {
    return 'This book is not available for manual EPUB actions right now.';
  }
  if (result.status === 'cancelled') {
    return 'Load EPUB was cancelled.';
  }
  return `Loaded an EPUB for ${label}.`;
}

function useReadwiseBookActions(activeNodeId: string | null) {
  const [book, setBook] = useState<RuntimeReadwiseBookInventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'download' | 'load' | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!activeNodeId) {
      setBook(null);
      setIsLoading(false);
      setPendingAction(null);
      setStatusMessage('');
      return;
    }

    let isDisposed = false;
    setIsLoading(true);
    setPendingAction(null);
    setStatusMessage('');

    void loadRuntimeReadwiseBooksInventory().then((inventory) => {
      if (isDisposed) {
        return;
      }
      setBook(resolveBook(activeNodeId, inventory?.books ?? []));
      setIsLoading(false);
    });

    return () => {
      isDisposed = true;
    };
  }, [activeNodeId]);

  const runDownload = useCallback(async () => {
    if (!activeNodeId) {
      return;
    }
    setPendingAction('download');
    const result = await openRuntimeReadwiseBookDownload(activeNodeId);
    setStatusMessage(formatDownloadMessage(result, book));
    setPendingAction(null);
  }, [activeNodeId, book]);

  const runLoad = useCallback(async () => {
    if (!activeNodeId) {
      return;
    }
    setPendingAction('load');
    const result = await loadRuntimeReadwiseBookEpub(activeNodeId);
    setStatusMessage(formatLoadMessage(result, book));
    if (result?.status === 'selected') {
      setBook((current) => (current ? { ...current, epubStatus: 'received' } : current));
    }
    setPendingAction(null);
  }, [activeNodeId, book]);

  return { book, isLoading, pendingAction, runDownload, runLoad, statusMessage };
}

export function ReadwiseBookActionsPanel({ activeNodeId }: { activeNodeId: string | null }) {
  const { book, isLoading, pendingAction, runDownload, runLoad, statusMessage } = useReadwiseBookActions(activeNodeId);

  const helperText = useMemo(() => {
    if (!book) {
      return '';
    }
    return book.epubStatus === 'received'
      ? 'EPUB already received. You can load another file if you want to replace it.'
      : 'No EPUB has been loaded for this book yet.';
  }, [book]);

  if (!book && isLoading) {
    return null;
  }
  if (!book || !activeNodeId) {
    return null;
  }

  const isBusy = pendingAction !== null;

  return (
    <div className="px-4 pt-4">
      <div className="mx-auto flex w-full flex-col gap-3 rounded-xl border border-border bg-bg-panel px-4 py-4 [width:min(100%,var(--document-max-width))]">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Book actions</h3>
          <p className="text-[13px] text-foreground/60">{helperText}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AppButton disabled={isBusy} onClick={() => void runDownload()} size="sm" variant="primary">
            {pendingAction === 'download' ? 'Opening…' : 'Download EPUB'}
          </AppButton>
          <AppButton disabled={isBusy} onClick={() => void runLoad()} size="sm" variant="ghost">
            {pendingAction === 'load' ? 'Loading…' : 'Load EPUB'}
          </AppButton>
        </div>
        <p aria-live="polite" className="min-h-5 text-[12px] text-foreground/65">
          {statusMessage}
        </p>
      </div>
    </div>
  );
}
