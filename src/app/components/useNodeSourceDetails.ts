import { useEffect, useRef, useState } from 'react';

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
  const cacheRef = useRef<Record<string, RuntimeNodeSourceDetails | null>>({});

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    const cachedValue = Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId) ? cacheRef.current[nodeId] ?? null : null;
    setState({ isLoading: !Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId), value: cachedValue });

    void loadRuntimeNodeSourceDetails(nodeId).then((value) => {
      if (isDisposed) {
        return;
      }
      cacheRef.current[nodeId] = value;
      setState({ isLoading: false, value });
    });

    return () => {
      isDisposed = true;
    };
  }, [nodeId]);

  return state;
}
