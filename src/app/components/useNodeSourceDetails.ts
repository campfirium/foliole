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
const REFRESH_INTERVAL_MS = 2000;

function shouldPollPdfIndexStatus(value: RuntimeNodeSourceDetails | null) {
  const status = value?.importSource?.pdfIndexStatus;
  return status === 'pending' || status === 'indexing';
}

export function useNodeSourceDetails(nodeId: string | null) {
  const [state, setState] = useState<NodeSourceDetailsState>(DEFAULT_STATE);
  const cacheRef = useRef<Record<string, RuntimeNodeSourceDetails | null>>({});

  useEffect(() => {
    if (!nodeId) {
      setState(DEFAULT_STATE);
      return;
    }

    let isDisposed = false;
    let refreshTimer: number | null = null;
    const cachedValue = Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId) ? cacheRef.current[nodeId] ?? null : null;
    setState({ isLoading: !Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId), value: cachedValue });

    const refresh = () =>
      loadRuntimeNodeSourceDetails(nodeId).then((value) => {
        if (isDisposed) {
          return;
        }
        cacheRef.current[nodeId] = value;
        setState({ isLoading: false, value });
        if (shouldPollPdfIndexStatus(value)) {
          refreshTimer = window.setTimeout(refresh, REFRESH_INTERVAL_MS);
        }
      });

    void refresh();

    return () => {
      isDisposed = true;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, [nodeId]);

  return state;
}
