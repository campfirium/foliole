import { useCallback, useEffect, useRef, useState } from 'react';

import { loadRuntimeNodeSourceDetails, type RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import { updateSourceDetailsCacheStats } from '../../shared/platform/performanceDiagnosticsProbe';

import {
  READWISE_ORIGINAL_FILE_LOADED_EVENT,
  type ReadwiseOriginalFileLoadedEventDetail
} from './readwiseBookActionState';

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

function useReadwiseOriginalFileLoadedRefresh(nodeId: string | null, retry: () => void) {
  useEffect(() => {
    if (!nodeId) {
      return undefined;
    }
    function handleReadwiseOriginalFileLoaded(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail as ReadwiseOriginalFileLoadedEventDetail | null : null;
      if (detail?.nodeId === nodeId) {
        retry();
      }
    }
    window.addEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, handleReadwiseOriginalFileLoaded);
    return () => window.removeEventListener(READWISE_ORIGINAL_FILE_LOADED_EVENT, handleReadwiseOriginalFileLoaded);
  }, [nodeId, retry]);
}

export function useNodeSourceDetails(nodeId: string | null) {
  const [state, setState] = useState<NodeSourceDetailsState>(DEFAULT_STATE);
  const cacheRef = useRef<Record<string, RuntimeNodeSourceDetails | null>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const retry = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useReadwiseOriginalFileLoadedRefresh(nodeId, retry);

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
  }, [nodeId, refreshKey]);

  return { ...state, retry };
}
