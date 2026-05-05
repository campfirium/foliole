import { useCallback, useEffect, useState } from 'react';

import {
  loadRuntimeExternalSearchPreview,
  type RuntimeExternalSearchPreview
} from '../../shared/platform/externalSearchBridge';

export function useExternalSearchPreviewDocument(absolutePath: string | null) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<RuntimeExternalSearchPreview | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!absolutePath) {
      setError(null);
      setIsLoading(false);
      setPreview(null);
      return;
    }

    let alive = true;
    setError(null);
    setIsLoading(true);
    setPreview(null);
    void loadRuntimeExternalSearchPreview(absolutePath)
      .then((result) => {
        if (!alive) {
          return;
        }
        setPreview(result);
        setError(result ? null : 'Could not load external document preview.');
      })
      .catch((nextError) => {
        if (!alive) {
          return;
        }
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : 'Could not load external document preview.');
      })
      .finally(() => {
        if (alive) {
          setIsLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [absolutePath, reloadKey]);

  const retry = useCallback(() => {
    if (absolutePath) {
      setReloadKey((current) => current + 1);
    }
  }, [absolutePath]);

  return { error, isLoading, preview, retry };
}
