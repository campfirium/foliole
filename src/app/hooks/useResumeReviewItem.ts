import { useCallback } from 'react';

import type { ReviewSchedulerSettingsContextValue } from '../../features/settings/context/reviewSchedulerSettingsContext';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export const RESUME_REVIEW_UNAVAILABLE_NOTICE = 'Nothing is available to resume in Flow.';

export function useResumeReviewItem(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  nowIso: string;
  reviewSettings: ReviewSchedulerSettingsContextValue;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useCallback(async () => {
    if (!args.reviewSettings.isReviewSchedulerSettingsReady) {
      showAppRuntimeNotice(RESUME_REVIEW_UNAVAILABLE_NOTICE);
      return;
    }
    const resumeOptions = {
      preferredNodeId: args.ws.activeNodeId
    };
    const nodeId = await args.ws.resumeReviewSession(args.nowIso, resumeOptions);
    if (!nodeId) {
      showAppRuntimeNotice(RESUME_REVIEW_UNAVAILABLE_NOTICE);
      return;
    }
    args.controller.runtime.flushPendingEditorDraft();
    args.controller.runtime.setIsViewingTrashNode(false);
    args.controller.trash.closeTrashView();
    args.controller.externalView.closeExternalView();
    args.controller.virtualView.closeVirtualView();
    args.controller.nav.handleSelectNode(nodeId, null, 'target-context');
  }, [args.controller, args.nowIso, args.reviewSettings.isReviewSchedulerSettingsReady, args.ws.activeNodeId, args.ws.resumeReviewSession]);
}
