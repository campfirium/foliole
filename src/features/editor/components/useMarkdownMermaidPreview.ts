import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

import {
  MARKDOWN_MERMAID_PREVIEW_EVENT,
  type MarkdownMermaidPreviewRequest
} from '../model/markdownMermaidPreview';

export function useMarkdownMermaidPreview(hostRef: MutableRefObject<HTMLElement | null>) {
  const [previewMermaid, setPreviewMermaid] = useState<MarkdownMermaidPreviewRequest | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handlePreviewRequest = (event: Event) => {
      const detail = (event as CustomEvent<MarkdownMermaidPreviewRequest>).detail;
      if (!detail?.source?.trim()) return;
      setPreviewMermaid({ source: detail.source });
    };

    host.addEventListener(MARKDOWN_MERMAID_PREVIEW_EVENT, handlePreviewRequest as EventListener);
    return () => host.removeEventListener(MARKDOWN_MERMAID_PREVIEW_EVENT, handlePreviewRequest as EventListener);
  }, [hostRef]);

  return {
    closePreview: () => setPreviewMermaid(null),
    previewMermaid
  };
}
