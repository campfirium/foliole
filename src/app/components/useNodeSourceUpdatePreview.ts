import { useEffect, useState } from 'react';

import { onManagedInboxUpdated } from '../../shared/platform/bridge';
import { loadRuntimeNodeSourceUpdatePreview, type RuntimeNodeSourceUpdatePreview } from '../../shared/platform/nodeSourceRuntimeRepository';

interface NodeSourceUpdatePreviewState {
  isLoading: boolean;
  value: RuntimeNodeSourceUpdatePreview | null;
}

const DEFAULT_STATE: NodeSourceUpdatePreviewState = {
  isLoading: false,
  value: null
};

export function useNodeSourceUpdatePreview(nodeId: string | null) {
  const [state, setState] = useState<NodeSourceUpdatePreviewState>(DEFAULT_STATE);

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    const loadPreview = async () => {
      setState((current) => ({ isLoading: true, value: current.value }));
      const value = await loadRuntimeNodeSourceUpdatePreview(nodeId);
      if (!isDisposed) {
        setState({ isLoading: false, value });
      }
    };

    void loadPreview();

    void onManagedInboxUpdated(() => {
      void loadPreview();
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

  return state;
}
