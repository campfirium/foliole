import { useEffect, useState } from 'react';

import { onManagedInboxUpdated, openLocalPath } from '../../shared/platform/bridge';
import { loadRuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';

interface NodeSourceUpdatePreviewState {
  hasSourceUpdate: boolean;
  isLoading: boolean;
  sourceFilePath: string | null;
}

const DEFAULT_STATE: NodeSourceUpdatePreviewState = {
  hasSourceUpdate: false,
  isLoading: false,
  sourceFilePath: null
};

function toSourceUpdateState(details: Awaited<ReturnType<typeof loadRuntimeNodeSourceDetails>>): NodeSourceUpdatePreviewState {
  const keepItem = details?.keepImportItem ?? null;
  return {
    hasSourceUpdate: Boolean(keepItem?.hasSourceUpdate && keepItem.resolvedSourcePath),
    isLoading: false,
    sourceFilePath: keepItem?.resolvedSourcePath ?? null
  };
}

export function useNodeSourceUpdatePreview(nodeId: string | null) {
  const [state, setState] = useState<NodeSourceUpdatePreviewState>(DEFAULT_STATE);

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    const loadState = async () => {
      setState((current) => ({ ...current, isLoading: true }));
      const details = await loadRuntimeNodeSourceDetails(nodeId);
      if (!isDisposed) {
        setState(toSourceUpdateState(details));
      }
    };

    void loadState();

    void onManagedInboxUpdated(() => {
      void loadState();
    }).then((dispose) => {
      if (isDisposed) {
        dispose?.();
        return;
      }
      unlisten = dispose;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [nodeId]);

  return {
    ...state,
    openSourceFile: async () => {
      if (!state.sourceFilePath) {
        return;
      }
      await openLocalPath(state.sourceFilePath);
    }
  };
}
