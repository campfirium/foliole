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

export function useReviewQueueEmptyDialogState(
  flowWindow: ReviewFlowWindow,
  options: { allowDemoDayClear?: boolean } = {}
) {
  const demoState = useDemoRuntimeState();
  const openedDemoPreviewDayRef = useRef<number | null>(null);
  const [content, setContent] = useState<ReviewQueueEmptyDialogContent | null>(null);
  const allowDemoDayClear = options.allowDemoDayClear ?? true;
  const shouldOpenBeforeStart = allowDemoDayClear && demoState.isDemo && shouldShowDemoDayClearDialog(flowWindow);
  const close = useCallback(() => setContent(null), []);
  const openDemoDayClear = useCallback(() => {
    openedDemoPreviewDayRef.current = demoState.previewDay;
    setContent(buildDemoDayClearContent(demoState.previewDay));
  }, [demoState.previewDay]);
  const openEmpty = useCallback(() => {
    if (shouldOpenBeforeStart) {
      openDemoDayClear();
      return;
    }
    setContent({ kind: 'empty' });
  }, [openDemoDayClear, shouldOpenBeforeStart]);
  const openClear = useCallback(() => {
    if (demoState.isDemo && shouldShowDemoDayClearDialog(flowWindow)) {
      openDemoDayClear();
      return;
    }
    setContent({ kind: 'empty' });
  }, [demoState.isDemo, flowWindow, openDemoDayClear]);

  useEffect(() => {
    if (!allowDemoDayClear || !demoState.isDemo || !shouldShowDemoDayClearDialog(flowWindow)) {
      return;
    }
    if (openedDemoPreviewDayRef.current === demoState.previewDay) {
      return;
    }
    openDemoDayClear();
  }, [allowDemoDayClear, demoState.isDemo, demoState.previewDay, flowWindow, openDemoDayClear]);

  return {
    close,
    content,
    isOpen: content !== null,
    openClear,
    openEmpty,
    shouldOpenBeforeStart
  };
}

export function bindReviewQueueEmptyDialogToLayoutProps(
  layoutProps: WorkspaceLayoutProps,
  openEmptyDialog: () => void,
  shouldOpenBeforeStart = false
): WorkspaceLayoutProps {
  return {
    ...layoutProps,
    review: {
      ...layoutProps.review,
      onStartStudyMode: () => startReviewAction(layoutProps.review.onStartStudyMode, openEmptyDialog, shouldOpenBeforeStart),
      onToggleReviewSession: () => startReviewAction(layoutProps.review.onToggleReviewSession, openEmptyDialog, shouldOpenBeforeStart)
    }
  };
}

function startReviewAction(action: () => boolean, openEmptyDialog: () => void, shouldOpenBeforeStart: boolean) {
  if (shouldOpenBeforeStart) {
    openEmptyDialog();
    return false;
  }
  if (action()) {
    return true;
  }
  openEmptyDialog();
  return false;
}
