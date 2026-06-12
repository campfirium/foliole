import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadExternalDocumentPreview,
  type ExternalDocumentPreview
} from '../../shared/platform/externalDocumentPreviewRepository';

export function useExternalSearchPreviewDocument(
  absolutePath: string | null,
  options: {
    folderId?: string | undefined;
    sourceKind?: 'external_document' | 'local_file' | undefined;
  } = {}
) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<ExternalDocumentPreview | null>(null);
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
    void loadExternalDocumentPreview(absolutePath, options)
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
  }, [absolutePath, options.folderId, options.sourceKind, reloadKey]);

  const retry = useCallback(() => {
    if (absolutePath) {
      setReloadKey((current) => current + 1);
    }
  }, [absolutePath]);

  return useMemo(
    () => ({ error, isLoading, preview, retry }),
    [error, isLoading, preview, retry]
  );
}

export type ExternalDocumentPreviewLoadState = ReturnType<typeof useExternalSearchPreviewDocument>;
