import type { StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';

import { markCompanionNodeOpened } from './companionBrowseOpenState';
import type { CompanionTabAction } from './CompanionFloatingBars';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

type CompanionActionStateArgs = {
  activeAction: CompanionTabAction;
  backlinkReturnNodeIds: string[];
  browseReturnNodeId: string | null;
  browsedFolderNodeId: string | null;
  floatingBar: FloatingBarVisibilityApi;
  flowNodeId: string | null;
  selectedBrowseNodeId: string | null;
  setActiveAction: (action: CompanionTabAction) => void;
  setBacklinkReturnNodeIds: (nodeIds: string[]) => void;
  setBrowseReturnNodeId: (nodeId: string | null) => void;
  setReadingError: (value: string | null) => void;
  setReviewError: (value: string | null) => void;
  setSelectedBrowseNodeId: (nodeId: string | null, anchor?: StoredAnchorLink) => void;
  snapshot: WorkspaceSnapshot | null;
  workspaceSync: CompanionWorkspaceSyncApi;
};

function openBrowseNode(args: CompanionActionStateArgs, nodeId: string) {
  const node = args.snapshot?.nodesById[nodeId];
  if (node?.kind === 'folder' && node.virtualFilter) {
    void Promise.resolve(args.workspaceSync.openVirtualFolder(nodeId)).catch(() => undefined);
  }
  void markCompanionNodeOpened({ nodeId, snapshot: args.snapshot, workspaceSync: args.workspaceSync })
    .catch(() => undefined);
}

function selectBrowseNode(args: CompanionActionStateArgs, nodeId: string, anchor?: StoredAnchorLink) {
  if (anchor) args.setSelectedBrowseNodeId(nodeId, anchor);
  else args.setSelectedBrowseNodeId(nodeId);
  openBrowseNode(args, nodeId);
  if (args.activeAction !== 'review') args.setActiveAction('recent');
  args.floatingBar.revealBar();
}

function createBacklinkNavigation(args: CompanionActionStateArgs) {
  function handleOpenBacklink(originNodeId: string, sourceNodeId: string) {
    args.setBacklinkReturnNodeIds([...args.backlinkReturnNodeIds, originNodeId]);
    selectBrowseNode(args, sourceNodeId);
  }

  const { snapshot } = args;
  const availableOrigins = args.selectedBrowseNodeId && snapshot
    ? args.backlinkReturnNodeIds.filter(id => isCanonicalVisibleNodeId(snapshot, id)) : [];
  const origin = availableOrigins.at(-1);
  const returnFromBacklink = origin ? () => {
    const remaining = availableOrigins.slice(0, -1);
    args.setBacklinkReturnNodeIds(remaining);
    if (!remaining.length && args.activeAction === 'review' && origin === args.flowNodeId) {
      args.setSelectedBrowseNodeId(null);
    } else {
      selectBrowseNode(args, origin);
    }
  } : undefined;

  return { handleOpenBacklink, returnFromBacklink };
}

export function useCompanionActionState(args: CompanionActionStateArgs) {
  function clearBacklinkReturn() {
    if (args.backlinkReturnNodeIds.length) args.setBacklinkReturnNodeIds([]);
  }

  function handleTabAction(action: CompanionTabAction) {
    clearBacklinkReturn();
    args.setActiveAction(action);
    args.setReviewError(null);
    args.setReadingError(null);
    if (action === 'review') {
      args.setBrowseReturnNodeId(null);
      args.setSelectedBrowseNodeId(null);
    }
    if (action === 'recent') {
      args.setBrowseReturnNodeId(null);
      args.setSelectedBrowseNodeId(null);
      args.floatingBar.revealBar();
    }
  }

  function handleSelectRecentArticle(nodeId: string) {
    clearBacklinkReturn();
    args.setBrowseReturnNodeId(null);
    selectBrowseNode(args, nodeId);
  }

  function handleSelectBrowseNode(nodeId: string, anchor?: StoredAnchorLink) {
    clearBacklinkReturn();
    args.setBrowseReturnNodeId(args.browsedFolderNodeId ?? (nodeId === args.browseReturnNodeId ? null : args.browseReturnNodeId));
    selectBrowseNode(args, nodeId, anchor);
  }

  function handleExitBrowseArticle() {
    if (args.browseReturnNodeId) {
      handleSelectBrowseNode(args.browseReturnNodeId);
      return;
    }
    handleTabAction(args.activeAction === 'review' ? 'review' : 'recent');
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
    handleExitFlowHere: (nodeId: string) => {
      clearBacklinkReturn();
      args.setSelectedBrowseNodeId(nodeId);
      args.setActiveAction('recent');
    },
    handleExitDirectoryArticle,
    handleExitBrowseArticle,
    handleExitSearchArticle,
    ...createBacklinkNavigation(args),
    handleSelectBrowseNode,
    handleSelectRecentArticle,
    handleTabAction
  };
}
