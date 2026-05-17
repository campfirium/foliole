import { isTextAnchorLocator, type Node, type TextAnchorLocator } from '../features/nodes/model/nodeTypes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export interface HighlightRangeUpdate {
  from: number;
  to: number;
}

function isValidRange(range: HighlightRangeUpdate, contentLength: number) {
  return (
    Number.isInteger(range.from) &&
    Number.isInteger(range.to) &&
    range.from >= 0 &&
    range.to > range.from &&
    range.to <= contentLength
  );
}

function buildUpdatedHighlightNode(args: {
  node: Node;
  parentContent: string;
  range: HighlightRangeUpdate;
  timestamp: string;
}) {
  if (args.node.anchorLink?.kind !== 'highlight' || !isTextAnchorLocator(args.node.anchorLink.locator)) {
    return null;
  }
  if (!isValidRange(args.range, args.parentContent.length)) {
    return null;
  }
  const locator: TextAnchorLocator = {
    from: args.range.from,
    originalText: args.parentContent.slice(args.range.from, args.range.to),
    to: args.range.to
  };
  return {
    ...args.node,
    anchorLink: {
      ...args.node.anchorLink,
      locator
    },
    updatedAt: args.timestamp
  } satisfies Node;
}

export function createUpdateHighlightAnchorRangeAction(set: WorkspaceSet) {
  return (highlightNodeId: string, parentContent: string, range: HighlightRangeUpdate) => {
    let nextNodeForSync: Node | null = null;
    set((state) => {
      const node = state.nodesById[highlightNodeId];
      if (!node || state.trashedNodeIds.includes(highlightNodeId)) {
        return state;
      }
      const parentNode = node.parentNodeId ? state.nodesById[node.parentNodeId] : null;
      if (!parentNode || parentNode.content !== parentContent) {
        return state;
      }
      const nextNode = buildUpdatedHighlightNode({
        node,
        parentContent,
        range,
        timestamp: new Date().toISOString()
      });
      if (!nextNode) {
        return state;
      }
      nextNodeForSync = nextNode;
      return {
        nodesById: {
          ...state.nodesById,
          [highlightNodeId]: nextNode
        }
      };
    });
    if (!nextNodeForSync) {
      return false;
    }
    syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
    syncNodeContentToRuntime(nextNodeForSync);
    return true;
  };
}
