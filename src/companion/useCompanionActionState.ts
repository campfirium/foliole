import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { markCompanionNodeOpened } from './companionBrowseOpenState';
import type { CompanionTabAction } from './CompanionFloatingBars';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function useCompanionActionState(args: {
  floatingBar: FloatingBarVisibilityApi;
  setActiveAction: (action: CompanionTabAction) => void;
  setReadingError: (value: string | null) => void;
  setReviewError: (value: string | null) => void;
  setSelectedBrowseNodeId: (nodeId: string | null) => void;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  function markOpened(nodeId: string) {
    void markCompanionNodeOpened({
      nodeId,
      snapshot: args.snapshot,
      workspaceSync: args.workspaceSync
    }).catch(() => undefined);
  }

  function handleTabAction(action: CompanionTabAction) {
    args.setActiveAction(action);
    args.setReviewError(null);
    args.setReadingError(null);
    if (action === 'recent') {
      args.setSelectedBrowseNodeId(null);
      args.floatingBar.revealBar();
    }
  }

  function handleSelectRecentArticle(nodeId: string) {
    args.setSelectedBrowseNodeId(nodeId);
    markOpened(nodeId);
    args.setActiveAction('recent');
    args.floatingBar.revealBar();
  }

  function handleSelectBrowseNode(nodeId: string) {
    args.setSelectedBrowseNodeId(nodeId);
    markOpened(nodeId);
    args.setActiveAction('recent');
    args.floatingBar.revealBar();
  }

  return { handleSelectBrowseNode, handleSelectRecentArticle, handleTabAction };
}
