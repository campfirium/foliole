import { useCallback } from 'react';

import { continueToNextDemoPreviewDay } from '../../shared/platform/runtime/demoRuntime';
import type { useAppController } from '../hooks/useAppController';
import {
  bindReviewQueueEmptyDialogToLayoutProps,
  useReviewQueueEmptyDialogState
} from '../hooks/useReviewQueueEmptyDialogState';

import { ReviewQueueEmptyDialog } from './ReviewQueueEmptyDialog';
import { WorkspaceLayout } from './WorkspaceLayout';

export function WorkspaceLayoutWithReviewQueueDialog({ controller }: { controller: ReturnType<typeof useAppController> }) {
  const workspaceLayoutProps = buildWorkspaceLayoutProps(controller);
  const dialog = useReviewQueueEmptyDialogState(workspaceLayoutProps.review.reviewFlowWindow);
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
    continueToNextDemoPreviewDay();
    dialog.close();
  }, [dialog]);

  return (
    <>
      <WorkspaceLayout {...layoutProps} />
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
