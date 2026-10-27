import { useCallback, useRef, useState } from 'react';

import { getBrowserDailyFlowRuntime } from '../../shared/platform/runtime/dailyFlowBrowserRuntime';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import type { ReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';
import type { WorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';
import { getDemoPreviewDisplayDay } from '../components/workspaceRightSidebarReviewQueueDays';

import { useDailyFlowFuture } from './useDailyFlowFuture';

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
  options: { allowDemoDayClear?: boolean; currentDayAvailable?: boolean | undefined } = {}
) {
  const demoState = useDemoRuntimeState();
  const future = useDailyFlowFuture(flowWindow.queriedAt ?? '', demoState.isDemo, false, 'recommended');
  const dayClear = getBrowserDailyFlowRuntime()
    ? options.currentDayAvailable === false && Boolean(future?.view?.hasFuture) : shouldShowDemoDayClearDialog(flowWindow);
  const openedDemoPreviewDayRef = useRef<number | null>(null);
  const [content, setContent] = useState<ReviewQueueEmptyDialogContent | null>(null);
  const allowDemoDayClear = options.allowDemoDayClear ?? true;
  const shouldOpenBeforeStart = allowDemoDayClear && demoState.isDemo && dayClear;
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
    if (demoState.isDemo && dayClear) {
      openDemoDayClear();
      return;
    }
    setContent({ kind: 'empty' });
  }, [demoState.isDemo, dayClear, openDemoDayClear]);

  return {
    close,
    content,
    isReady: !getBrowserDailyFlowRuntime() || Boolean(future?.view && options.currentDayAvailable !== undefined),
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

function startReviewAction(action: () => boolean | Promise<boolean>, openEmptyDialog: () => void, shouldOpenBeforeStart: boolean) {
  if (shouldOpenBeforeStart) {
    openEmptyDialog();
    return false;
  }
  const apply = (started: boolean) => { if (!started) openEmptyDialog(); return started; };
  const result = action();
  return typeof result === 'boolean' ? apply(result) : result.then(apply);
}
