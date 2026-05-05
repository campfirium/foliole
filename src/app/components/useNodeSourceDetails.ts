import { useEffect, useRef, useState } from 'react';

import { loadRuntimeNodeSourceDetails, type RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
import { updateSourceDetailsCacheStats } from '../../shared/platform/performanceDiagnosticsProbe';

interface NodeSourceDetailsState {
  errorMessage: string;
  isLoading: boolean;
  value: RuntimeNodeSourceDetails | null;
}

const DEFAULT_STATE: NodeSourceDetailsState = {
  errorMessage: '',
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
    const hasCachedValue = Object.prototype.hasOwnProperty.call(cacheRef.current, nodeId);
    const cachedValue = hasCachedValue ? cacheRef.current[nodeId] ?? null : null;
    updateSourceDetailsCacheStats({
      entries: Object.keys(cacheRef.current).length,
      hit: hasCachedValue
    });
    setState({ errorMessage: '', isLoading: !hasCachedValue, value: cachedValue });

    const refresh = () =>
      loadRuntimeNodeSourceDetails(nodeId)
        .then((value) => {
          if (isDisposed) {
            return;
          }
          cacheRef.current[nodeId] = value;
          updateSourceDetailsCacheStats({
            entries: Object.keys(cacheRef.current).length,
            hit: true
          });
          setState({ errorMessage: '', isLoading: false, value });
          if (shouldPollPdfIndexStatus(value)) {
            refreshTimer = window.setTimeout(refresh, REFRESH_INTERVAL_MS);
          }
        })
        .catch(() => {
          if (isDisposed) {
            return;
          }
          setState({ errorMessage: 'Source info could not be loaded.', isLoading: false, value: cachedValue });
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
