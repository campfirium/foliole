import type { ReactNode } from 'react';
import { useEffect } from 'react';

import {
  isReadwiseOriginalFileWidgetActionDetail,
  READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT
} from '../../shared/platform/readwiseOriginalFileWidgetEvents';

import { useReadwiseBookActions } from './readwiseBookActionState';

export function ReadwiseBookDocumentGate({
  activeNodeId,
  children
}: {
  activeContent: string;
  activeNodeId: string | null;
  children?: ReactNode;
}) {
  const { runDownload, runLoad } = useReadwiseBookActions(activeNodeId);

  useEffect(() => {
    function handleAction(event: Event) {
      if (!(event instanceof CustomEvent) || !isReadwiseOriginalFileWidgetActionDetail(event.detail)) return;
      if (!activeNodeId || event.detail.nodeId !== activeNodeId) return;
      if (event.detail.action === 'download') void runDownload();
      if (event.detail.action === 'load') void runLoad();
    }
    window.addEventListener(READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT, handleAction);
    return () => window.removeEventListener(READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT, handleAction);
  }, [activeNodeId, runDownload, runLoad]);

  return children ?? null;
}
