import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

import {
  MARKDOWN_IMAGE_PREVIEW_EVENT,
  type MarkdownImagePreviewRequest
} from '../model/markdownImagePreview';

export function useMarkdownImagePreview(hostRef: MutableRefObject<HTMLElement | null>) {
  const [previewImage, setPreviewImage] = useState<MarkdownImagePreviewRequest | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const handlePreviewRequest = (event: Event) => {
      const detail = (event as CustomEvent<MarkdownImagePreviewRequest>).detail;
      if (!detail?.src) {
        return;
      }
      setPreviewImage({ alt: detail.alt ?? '', presentation: detail.presentation ?? null, src: detail.src });
    };

    host.addEventListener(MARKDOWN_IMAGE_PREVIEW_EVENT, handlePreviewRequest as EventListener);
    return () => host.removeEventListener(MARKDOWN_IMAGE_PREVIEW_EVENT, handlePreviewRequest as EventListener);
  }, [hostRef]);

  return {
    closePreview: () => setPreviewImage(null),
    previewImage
  };
}
