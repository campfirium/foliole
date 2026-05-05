import { useCallback, useEffect, useMemo, useState } from 'react';

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
  if (result.status === 'failed') {
    return result.error_message?.trim() || `Could not load an EPUB for ${label}.`;
  }
  return `Loaded an EPUB for ${label}.`;
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
        if (payload.nodeId !== activeNodeId) {
          return;
        }
        setLoadProgress({
          detail: payload.detail,
          progress: Math.max(0, Math.min(1, payload.progress))
        });
      }) ?? undefined
    );
  }, [activeNodeId]);

  return { loadProgress, setLoadProgress };
}

function useReadwiseBookActions(activeNodeId: string | null) {
  const { book, isLoading, setBook } = useReadwiseBookInventory(activeNodeId);
  const { loadProgress, setLoadProgress } = useReadwiseBookLoadProgress(activeNodeId);
  const [pendingAction, setPendingAction] = useState<'download' | 'load' | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!activeNodeId) {
      setPendingAction(null);
      setStatusMessage('');
      return;
    }
    setPendingAction(null);
    setStatusMessage('');
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
    setLoadProgress({ detail: 'Waiting for EPUB file…', progress: 0.1 });
    try {
      const result = await loadRuntimeReadwiseBookEpub(activeNodeId);
      setStatusMessage(formatLoadMessage(result, book));
      if (result?.status === 'selected') {
        setBook((current) => (current ? { ...current, epubStatus: 'received' } : current));
        setLoadProgress({ detail: 'Done.', progress: 1 });
      } else {
        setLoadProgress(createIdleProgress());
      }
    } finally {
      setPendingAction(null);
    }
  }, [activeNodeId, book]);

  return { book, isLoading, loadProgress, pendingAction, runDownload, runLoad, statusMessage };
}

export function ReadwiseBookActionsPanel({ activeNodeId }: { activeNodeId: string | null }) {
  const { book, isLoading, loadProgress, pendingAction, runDownload, runLoad, statusMessage } =
    useReadwiseBookActions(activeNodeId);

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
  const showLoadProgress = pendingAction === 'load' || loadProgress.progress > 0;

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
        {showLoadProgress ? (
          <div className="flex flex-col gap-1">
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div
                aria-hidden="true"
                className="h-full rounded-full bg-foreground/70 transition-[width] duration-200"
                style={{ width: `${Math.round(loadProgress.progress * 100)}%` }}
              />
            </div>
            <p className="text-[12px] text-foreground/65">{loadProgress.detail}</p>
          </div>
        ) : null}
        <p aria-live="polite" className="min-h-5 text-[12px] text-foreground/65">
          {statusMessage}
        </p>
      </div>
    </div>
  );
}
