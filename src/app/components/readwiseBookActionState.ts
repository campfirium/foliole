import { useCallback, useEffect, useState } from 'react';

import type {
  NativeReadwiseBookDownloadResult,
  NativeReadwiseBookEpubLoadResult
} from '../../../lib/platform/nativeReadwiseContract';
import {
  loadRuntimeReadwiseBookEpub,
  onRuntimeReadwiseBookEpubProgress,
  openRuntimeReadwiseBookDownload,
  type RuntimeReadwiseBookEpubProgressEvent
} from '../../shared/platform/readwiseBooksRuntimeRepository';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { requestReadwiseBookEpubImportReleaseMode } from '../hooks/epubImportReleaseModeDialogStore';

export const READWISE_ORIGINAL_FILE_LOADED_EVENT = 'foliole:readwise-original-file-loaded';

export interface ReadwiseOriginalFileLoadedEventDetail {
  nodeId: string;
}

function getBookLabel(title: string | null) {
  return title?.trim() || 'this book';
}

function formatDownloadMessage(result: NativeReadwiseBookDownloadResult | null) {
  const label = getBookLabel(result?.title ?? null);
  if (!result || result.status === 'book_not_found') return 'This topic is not available for original file actions right now.';
  if (result.status === 'missing_link') return `No original file download link was found for ${label}.`;
  if (result.status === 'source_inactive') return 'Readwise actions are available where this source is active.';
  return `Opened the original file download for ${label}.`;
}

function formatLoadMessage(result: NativeReadwiseBookEpubLoadResult | null) {
  const label = getBookLabel(result?.title ?? null);
  if (!result || result.status === 'book_not_found') return 'This topic is not available for original file actions right now.';
  if (result.status === 'cancelled') return 'Load original file was cancelled.';
  if (result.status === 'failed') return result.error_message?.trim() || `Could not load an original file for ${label}.`;
  if (result.status === 'source_inactive') {
    return result.error_message?.trim() || 'Readwise actions are available where this source is active.';
  }
  return `Loaded an original file for ${label}.`;
}

function createIdleProgress() {
  return { detail: '', progress: 0 };
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
    setStatusMessage(formatDownloadMessage(result));
    setPendingAction(null);
  }, [activeNodeId]);

  const runLoad = useCallback(async () => {
    if (!activeNodeId) return;
    setPendingAction('load');
    setLoadProgress({ detail: 'Waiting for original file...', progress: 0.1 });
    try {
      const result = await loadRuntimeReadwiseBookEpub(activeNodeId);
      setStatusMessage(formatLoadMessage(result));
      if (result?.status === 'selected') {
        await refreshWorkspaceState('readwise-book-load');
        await ensureWorkspaceNodeDocumentReady(activeNodeId, { forceLoad: true });
        const mode = await requestReadwiseBookEpubImportReleaseMode({
          fileName: `${getBookLabel(result.title)}.epub`,
          hasHighlights: result.annotation_status === 'has_highlights'
        });
        if (mode) {
          useWorkspaceStore.getState().setNodeSequentialReading(activeNodeId, mode === 'sequential');
        }
        window.dispatchEvent(
          new CustomEvent<ReadwiseOriginalFileLoadedEventDetail>(READWISE_ORIGINAL_FILE_LOADED_EVENT, {
            detail: { nodeId: activeNodeId }
          })
        );
        setLoadProgress({ detail: 'Done.', progress: 1 });
      } else {
        setLoadProgress(createIdleProgress());
      }
    } finally {
      setPendingAction(null);
    }
  }, [activeNodeId, setLoadProgress]);

  return { loadProgress, pendingAction, runDownload, runLoad, statusMessage };
}
