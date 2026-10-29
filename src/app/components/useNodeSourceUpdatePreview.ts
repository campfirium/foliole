import { useEffect, useState } from 'react';

import { loadRuntimeNodeTextAlternativePreview } from '../../shared/platform/desktop/nodeTextAlternativeRuntimeRepository';
import { loadRuntimeNodeSourceUpdatePreview, type RuntimeNodeSourceUpdatePreview } from '../../shared/platform/nodeSourceRuntimeRepository';
import { onManagedInboxUpdated, onWorkspaceContentChanged } from '../../shared/platform/runtimeShellEvents';

interface NodeSourceUpdatePreviewState {
  isLoading: boolean;
  value: RuntimeNodeSourceUpdatePreview | null;
}

const DEFAULT_STATE: NodeSourceUpdatePreviewState = {
  isLoading: false,
  value: null
};

export function useNodeSourceUpdatePreview(nodeId: string | null) {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [state, setState] = useState<NodeSourceUpdatePreviewState>(DEFAULT_STATE);

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    const unlisteners: (() => void)[] = [];

    const loadPreview = async () => {
      setState((current) => ({ isLoading: true, value: current.value }));
      const value = await loadRuntimeNodeTextAlternativePreview(nodeId, selectedId)
        ?? await loadRuntimeNodeSourceUpdatePreview(nodeId);
      if (!isDisposed) {
        setState({ isLoading: false, value });
      }
    };

    void loadPreview();

    for (const subscribe of [onManagedInboxUpdated, onWorkspaceContentChanged]) {
      void subscribe(() => { void loadPreview(); }).then(dispose => {
        if (isDisposed) dispose?.();
        else if (dispose) unlisteners.push(dispose);
      });
    }

    return () => {
      isDisposed = true;
      unlisteners.forEach(dispose => dispose());
    };
  }, [nodeId, selectedId]);

  return { ...state, selectAlternative: setSelectedId };
}
