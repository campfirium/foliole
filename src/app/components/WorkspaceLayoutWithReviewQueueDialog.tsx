import { useCallback, useEffect, useRef } from 'react';

import { continueToNextDemoPreviewDay } from '../../shared/platform/runtime/demoRuntime';
import type { useAppController } from '../hooks/useAppController';
import {
  bindReviewQueueEmptyDialogToLayoutProps,
  useReviewQueueEmptyDialogState
} from '../hooks/useReviewQueueEmptyDialogState';

import { ReviewQueueEmptyDialog, ReviewQueueEmptyNotice } from './ReviewQueueEmptyDialog';
import { WorkspaceLayout } from './WorkspaceLayout';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

export function WorkspaceLayoutWithReviewQueueDialog({ controller }: { controller: ReturnType<typeof useAppController> }) {
  const workspaceLayoutProps = buildWorkspaceLayoutProps(controller);
  const openedCompletedSessionRef = useRef<string | null>(null);
  const dialog = useReviewQueueEmptyDialogState(workspaceLayoutProps.review.reviewFlowWindow, {
    allowDemoDayClear: !workspaceLayoutProps.review.isStudyMode
  });
  const layoutProps = bindReviewQueueEmptyDialogToLayoutProps(
    workspaceLayoutProps,
    dialog.openEmpty,
    dialog.shouldOpenBeforeStart
  );
  const handleExitReviewModeDialog = useCallback(() => {
    dialog.close();
    workspaceLayoutProps.review.onExitReviewMode();
  }, [dialog, workspaceLayoutProps.review]);
  const handleContinueDemoDay = useCallback(() => {
    workspaceLayoutProps.review.onExitReviewMode();
    continueToNextDemoPreviewDay();
    dialog.close();
    window.setTimeout(() => {
      controller.onStartNextDemoPreviewDayFlow();
    }, 0);
  }, [controller, dialog, workspaceLayoutProps.review]);
  const completedSessionKey = getCompletedNonQueueSessionKey(workspaceLayoutProps.review);

  useEffect(() => {
    if (!completedSessionKey || openedCompletedSessionRef.current === completedSessionKey) {
      return;
    }
    openedCompletedSessionRef.current = completedSessionKey;
    if (canContinueReadingNow(workspaceLayoutProps.review)) {
      workspaceLayoutProps.review.onContinueReading();
      return;
    }
    dialog.openClear();
  }, [completedSessionKey, dialog, workspaceLayoutProps.review]);

  return (
    <>
      <WorkspaceLayout
        {...layoutProps}
        overlay={<ReviewQueueEmptyNotice content={dialog.content} onClose={dialog.close} open={dialog.isOpen} />}
      />
      <ReviewQueueEmptyDialog
        content={dialog.content}
        onContinueDemoDay={handleContinueDemoDay}
        onClose={dialog.close}
        onExitReviewMode={handleExitReviewModeDialog}
        open={dialog.isOpen}
      />
    </>
  );
}

function buildWorkspaceLayoutProps(controller: ReturnType<typeof useAppController>) {
  return {
    ...controller.layoutProps,
    settings: {
      ...controller.layoutProps.settings,
      onRunRailAction: controller.paletteState.onRunCommand
    }
  };
}

function getCompletedNonQueueSessionKey(review: WorkspaceLayoutProps['review']) {
  if (!review.isStudyMode || review.reviewStatus !== 'completed' || review.reviewSummary.canContinueReading) {
    return null;
  }
  return [
    review.reviewSummary.completedAt ?? 'completed',
    review.reviewSummary.readTopicCount,
    review.reviewSummary.reviewedItemCount,
    review.reviewSummary.continueNodeId ?? ''
  ].join(':');
}

function canContinueReadingNow(review: WorkspaceLayoutProps['review']) {
  const continueNodeId = review.reviewSummary.continueNodeId;
  return Boolean(
    continueNodeId &&
    (
      review.reviewFlowWindow.queueNodeIds.includes(continueNodeId) ||
      review.reviewFlowWindow.readyNodeIds.includes(continueNodeId)
    )
  );
}
