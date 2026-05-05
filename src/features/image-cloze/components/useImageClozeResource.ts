import { useEffect, useState } from 'react';

import { resolveRuntimeAttachmentResource } from '../../../shared/platform/attachmentResources';

export interface ImageClozeResourceState {
  resourceState: 'idle' | 'missing' | 'ready';
  resourceUrl: string | null;
}

export function useImageClozeResource(attachmentId: string | null): ImageClozeResourceState {
  const [resourceUrl, setResourceUrl] = useState<string | null>(null);
  const [resourceState, setResourceState] = useState<'idle' | 'missing' | 'ready'>('idle');

  useEffect(() => {
    if (!attachmentId) {
      setResourceState('idle');
      setResourceUrl(null);
      return;
    }
    let cancelled = false;
    setResourceState('idle');
    setResourceUrl(null);
    void resolveRuntimeAttachmentResource(`asset://${attachmentId}`).then((resolution) => {
      if (cancelled) {
        return;
      }
      if (resolution?.status === 'ready' && resolution.resource_url) {
        setResourceState('ready');
        setResourceUrl(resolution.resource_url);
        return;
      }
      setResourceState('missing');
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return { resourceState, resourceUrl };
}
