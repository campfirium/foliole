import { useEffect, useState } from 'react';

import { loadRuntimeNodeSourceDetails, type RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';

interface NodeSourceDetailsState {
  isLoading: boolean;
  value: RuntimeNodeSourceDetails | null;
}

const DEFAULT_STATE: NodeSourceDetailsState = {
  isLoading: false,
  value: null
};

export function useNodeSourceDetails(nodeId: string | null) {
  const [state, setState] = useState<NodeSourceDetailsState>(DEFAULT_STATE);

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    setState((current) => ({ isLoading: true, value: current.value }));

    void loadRuntimeNodeSourceDetails(nodeId).then((value) => {
      if (isDisposed) {
        return;
      }
      setState({ isLoading: false, value });
    });

    return () => {
      isDisposed = true;
    };
  }, [nodeId]);

  return state;
}
