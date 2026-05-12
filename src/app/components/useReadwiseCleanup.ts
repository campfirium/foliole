import { useEffect, useState } from 'react';

import type {
  NativeReadwiseCleanupPreviewResult,
  NativeReadwiseCleanupRunResult
} from '../../../lib/platform/nativeContract';

type PreviewCleanup = () => Promise<NativeReadwiseCleanupPreviewResult | null>;
type RunCleanup = () => Promise<NativeReadwiseCleanupRunResult | null>;

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Readwise cleanup failed.';
}

function useReadwiseCleanupPreviewState(onPreviewCleanup?: PreviewCleanup) {
  const [error, setError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<NativeReadwiseCleanupPreviewResult | null>(null);

  async function loadPreview() {
    if (!onPreviewCleanup) {
      return null;
    }
    setIsLoadingPreview(true);
    try {
      const result = await onPreviewCleanup();
      setPreview(result);
      return result;
    } catch (nextError) {
      setError(resolveErrorMessage(nextError));
      return null;
    } finally {
      setIsLoadingPreview(false);
    }
  }

  return { error, isLoadingPreview, loadPreview, preview, setError, setPreview };
}

export function useReadwiseCleanup(input: {
  onCleanupComplete?: (result: NativeReadwiseCleanupRunResult) => void;
  onPreviewCleanup?: PreviewCleanup;
  onRunCleanup?: RunCleanup;
}) {
  const previewState = useReadwiseCleanupPreviewState(input.onPreviewCleanup);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const canRunCleanup = Boolean(input.onPreviewCleanup && input.onRunCleanup);

  useEffect(() => {
    if (canRunCleanup) {
      void previewState.loadPreview();
    }
  }, [canRunCleanup]);

  return {
    canRunCleanup,
    cleanupError: previewState.error,
    cleanupPreview: previewState.preview,
    cleanupDisabled:
      !canRunCleanup ||
      previewState.isLoadingPreview ||
      !previewState.preview ||
      previewState.preview.total_count === 0,
    isCleanupDialogOpen: isDialogOpen,
    isCleanupRunning: isRunning,
    closeCleanupDialog: () => setIsDialogOpen(false),
    async openCleanupDialog() {
      previewState.setError(null);
      await previewState.loadPreview();
      setIsDialogOpen(true);
    },
    async runCleanup() {
      if (!input.onRunCleanup || isRunning) {
        return;
      }
      setIsRunning(true);
      previewState.setError(null);
      try {
        const result = await input.onRunCleanup();
        if (result) {
          previewState.setPreview(result);
          input.onCleanupComplete?.(result);
        }
        setIsDialogOpen(false);
      } catch (nextError) {
        previewState.setError(resolveErrorMessage(nextError));
      } finally {
        setIsRunning(false);
      }
    }
  };
}
