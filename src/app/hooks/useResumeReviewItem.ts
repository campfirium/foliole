import { useCallback } from 'react';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export function useResumeReviewItem(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useCallback(() => {
    const nodeId = args.ws.reviewSession.currentNodeId;
    if (!nodeId) {
      return;
    }
    args.controller.runtime.flushPendingEditorDraft();
    args.controller.runtime.setIsViewingTrashNode(false);
    args.controller.trash.closeTrashView();
    args.controller.externalView.closeExternalView();
    args.controller.virtualView.closeVirtualView();
    args.controller.nav.handleSelectNode(nodeId);
  }, [args.controller, args.ws.reviewSession.currentNodeId]);
}
