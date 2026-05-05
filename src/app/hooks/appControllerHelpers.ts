import type { NodeReviewProfile } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { CommandPaletteItem } from '../../shared/commands/types';
import type { WorkspaceSearchResult } from '../components/workspaceSearch';

import type { useWorkspaceSelectors } from './appControllerState';
import type { AppGoToNodeState } from './appGoToNodeState';
import type { AppSearchState } from './appSearchState';
import type { AppPaletteState } from './useAppController';
import { useReviewPreview } from './useReviewPreview';

export function buildPaletteState(
  isOpen: boolean,
  items: CommandPaletteItem[],
  recentCommandIds: string[],
  onClose: () => void,
  onRunCommand: (id: string) => void
): AppPaletteState {
  return { isOpen, items, recentCommandIds, onClose, onRunCommand };
}

export function buildSearchState(
  isOpen: boolean,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: string[],
  onClose: () => void,
  onOpenResult: (result: WorkspaceSearchResult) => void
): AppSearchState {
  return { isOpen, nodeOrder, nodesById, onClose, onOpenResult, trashedNodeIds };
}

export function toSearchNodesById(nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById']) {
  return toWorkspaceListNodesById(nodesById);
}

export function buildGoToNodeState(
  isOpen: boolean,
  nodeOrder: string[],
  nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'],
  recentNodeIds: string[],
  trashedNodeIds: string[],
  onClose: () => void,
  onOpenNode: (nodeId: string) => void
): AppGoToNodeState {
  return {
    isOpen,
    nodeOrder,
    nodesById: toWorkspaceListNodesById(nodesById),
    onClose,
    onOpenNode,
    recentNodeIds,
    trashedNodeIds
  };
}

type WorkspaceSelectors = {
  nodesById: Record<string, { review: NodeReviewProfile | null } | undefined>;
  reviewSession: {
    currentNodeId: string | null;
    isAnswerRevealed: boolean;
  };
};

export function useCurrentReviewPreview(
  isStudyMode: boolean,
  ws: WorkspaceSelectors,
  previewSeed: string
) {
  return useReviewPreview({
    currentNodeId: ws.reviewSession.currentNodeId,
    isAnswerRevealed: ws.reviewSession.isAnswerRevealed,
    isStudyMode,
    previewSeed,
    reviewProfile: ws.reviewSession.currentNodeId
      ? (ws.nodesById[ws.reviewSession.currentNodeId]?.review ?? null)
      : null
  });
}
