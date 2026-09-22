import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import { markCompanionNodeOpened } from './companionBrowseOpenState';
import type { CompanionTabAction } from './CompanionFloatingBars';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

type CompanionActionStateArgs = {
  browseReturnNodeId: string | null;
  browsedFolderNodeId: string | null;
  floatingBar: FloatingBarVisibilityApi;
  setActiveAction: (action: CompanionTabAction) => void;
  setBrowseReturnNodeId: (nodeId: string | null) => void;
  setReadingError: (value: string | null) => void;
  setReviewError: (value: string | null) => void;
  setSelectedBrowseNodeId: (nodeId: string | null) => void;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: CompanionWorkspaceSyncApi;
};

function markOpened(args: CompanionActionStateArgs, nodeId: string) {
  void markCompanionNodeOpened({ nodeId, snapshot: args.snapshot, workspaceSync: args.workspaceSync })
    .catch(() => undefined);
}

function loadArticle(args: CompanionActionStateArgs, nodeId: string) {
  const node = args.snapshot?.nodesById[nodeId];
  if (!node) return;
  if (node.kind === 'folder') {
    if (node.virtualFilter) {
      void Promise.resolve(args.workspaceSync.openVirtualFolder(nodeId)).catch(() => undefined);
    }
    return;
  }
}

export function useCompanionActionState(args: CompanionActionStateArgs) {
  function handleTabAction(action: CompanionTabAction) {
    args.setActiveAction(action);
    args.setReviewError(null);
    args.setReadingError(null);
    if (action === 'recent') {
      args.setBrowseReturnNodeId(null);
      args.setSelectedBrowseNodeId(null);
      args.floatingBar.revealBar();
    }
  }

  function handleSelectRecentArticle(nodeId: string) {
    args.setBrowseReturnNodeId(null);
    args.setSelectedBrowseNodeId(nodeId);
    loadArticle(args, nodeId);
    markOpened(args, nodeId);
    args.setActiveAction('recent');
    args.floatingBar.revealBar();
  }

  function handleSelectBrowseNode(nodeId: string) {
    args.setBrowseReturnNodeId(args.browsedFolderNodeId);
    args.setSelectedBrowseNodeId(nodeId);
    loadArticle(args, nodeId);
    markOpened(args, nodeId);
    args.setActiveAction('recent');
    args.floatingBar.revealBar();
  }

  function handleExitBrowseArticle() {
    if (args.browseReturnNodeId) {
      handleSelectBrowseNode(args.browseReturnNodeId);
      return;
    }
    handleTabAction('recent');
  }

  function handleExitSearchArticle() {
    args.setBrowseReturnNodeId(null);
    args.setSelectedBrowseNodeId(null);
    handleTabAction('search');
  }

  function handleExitDirectoryArticle() {
    args.setBrowseReturnNodeId(null);
    handleTabAction('recent');
  }

  return {
    handleExitDirectoryArticle,
    handleExitBrowseArticle,
    handleExitSearchArticle,
    handleSelectBrowseNode,
    handleSelectRecentArticle,
    handleTabAction
  };
}
