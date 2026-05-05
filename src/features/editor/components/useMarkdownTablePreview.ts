import { useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';

import {
  MARKDOWN_TABLE_PREVIEW_EVENT,
  type MarkdownTablePreviewRequest
} from '../model/markdownTablePreview';

export function useMarkdownTablePreview(hostRef: MutableRefObject<HTMLElement | null>) {
  const [previewTable, setPreviewTable] = useState<MarkdownTablePreviewRequest | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handlePreviewRequest = (event: Event) => {
      const detail = (event as CustomEvent<MarkdownTablePreviewRequest>).detail;
      if (!detail?.table?.rows?.length) return;
      setPreviewTable({ table: detail.table });
    };

    host.addEventListener(MARKDOWN_TABLE_PREVIEW_EVENT, handlePreviewRequest as EventListener);
    return () => host.removeEventListener(MARKDOWN_TABLE_PREVIEW_EVENT, handlePreviewRequest as EventListener);
  }, [hostRef]);

  return {
    closePreview: () => setPreviewTable(null),
    previewTable
  };
}
