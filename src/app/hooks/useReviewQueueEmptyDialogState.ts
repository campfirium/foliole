import { useCallback, useEffect, useRef, useState } from 'react';

import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';
import type { WorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';
import { getDemoPreviewDisplayDay } from '../components/workspaceRightSidebarReviewQueueDays';

export type ReviewQueueEmptyDialogContent =
  | { kind: 'empty' }
  | { day: number; kind: 'demo-day-clear' };

function shouldShowDemoDayClearDialog(flowWindow: ReviewFlowWindow) {
  const currentDayCount = flowWindow.queueNodeIds.length + flowWindow.readyNodeIds.length;
  return currentDayCount === 0 && flowWindow.dayBuckets.some((bucket) => bucket.dayOffset > 0 && bucket.nodeIds.length > 0);
}

function buildDemoDayClearContent(previewDay: number): ReviewQueueEmptyDialogContent {
  return {
    day: getDemoPreviewDisplayDay(previewDay),
    kind: 'demo-day-clear'
  };
}

export function useReviewQueueEmptyDialogState(flowWindow: ReviewFlowWindow) {
  const demoState = useDemoRuntimeState();
  const openedDemoPreviewDayRef = useRef<number | null>(null);
  const [content, setContent] = useState<ReviewQueueEmptyDialogContent | null>(null);
  const close = useCallback(() => setContent(null), []);
  const openEmpty = useCallback(() => {
    setContent(
      demoState.isDemo && shouldShowDemoDayClearDialog(flowWindow)
        ? buildDemoDayClearContent(demoState.previewDay)
        : { kind: 'empty' }
    );
  }, [demoState.isDemo, demoState.previewDay, flowWindow]);

  useEffect(() => {
    if (!demoState.isDemo || !shouldShowDemoDayClearDialog(flowWindow)) {
      return;
    }
    if (openedDemoPreviewDayRef.current === demoState.previewDay) {
      return;
    }
    openedDemoPreviewDayRef.current = demoState.previewDay;
    setContent(buildDemoDayClearContent(demoState.previewDay));
  }, [demoState.isDemo, demoState.previewDay, flowWindow]);

  return {
    close,
    content,
    isOpen: content !== null,
    openEmpty
  };
}

export function bindReviewQueueEmptyDialogToLayoutProps(
  layoutProps: WorkspaceLayoutProps,
  openEmptyDialog: () => void
): WorkspaceLayoutProps {
  return {
    ...layoutProps,
    review: {
      ...layoutProps.review,
      onStartStudyMode: () => startReviewAction(layoutProps.review.onStartStudyMode, openEmptyDialog),
      onToggleReviewSession: () => startReviewAction(layoutProps.review.onToggleReviewSession, openEmptyDialog)
    }
  };
}

function startReviewAction(action: () => boolean, openEmptyDialog: () => void) {
  if (action()) {
    return true;
  }
  openEmptyDialog();
  return false;
}
