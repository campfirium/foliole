import { useEffect, useMemo, type ReactNode } from 'react';

import { collectReadwiseOriginalFilePlaceholderRanges } from '../../features/editor/model/readwiseOriginalFilePlaceholder';
import {
  isReadwiseOriginalFileWidgetActionDetail,
  READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT
} from '../../shared/platform/readwiseOriginalFileWidgetEvents';

import { useReadwiseBookActions } from './readwiseBookActionState';

export function ReadwiseBookDocumentGate({
  activeContent,
  activeNodeId,
  children
}: {
  activeContent: string;
  activeNodeId: string | null;
  children?: ReactNode;
}) {
  const isActionEligible = useMemo(
    () => collectReadwiseOriginalFilePlaceholderRanges(activeContent).length > 0,
    [activeContent]
  );
  const { runDownload, runLoad } = useReadwiseBookActions(isActionEligible ? activeNodeId : null);

  useEffect(() => {
    function handleAction(event: Event) {
      if (!(event instanceof CustomEvent) || !isReadwiseOriginalFileWidgetActionDetail(event.detail)) return;
      if (!isActionEligible || !activeNodeId || event.detail.nodeId !== activeNodeId) return;
      if (event.detail.action === 'download') void runDownload();
      if (event.detail.action === 'load') void runLoad();
    }
    window.addEventListener(READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT, handleAction);
    return () => window.removeEventListener(READWISE_ORIGINAL_FILE_WIDGET_ACTION_EVENT, handleAction);
  }, [activeNodeId, isActionEligible, runDownload, runLoad]);

  return children ?? null;
}
