import { isTextAnchorLocator, type Node, type TextAnchorLocator } from '../features/nodes/model/nodeTypes';

import {
  readCachedWorkspaceNodeDocument,
  syncWorkspaceNodeDocumentCacheFromNode
} from './workspaceNodeDocumentCache';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  buildUpdatedTextAnchorNode,
  syncUnloadedTextAnchorContent,
  type TextAnchorRangeUpdate
} from './workspaceStoreTextAnchorRangeSync';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export type HighlightRangeUpdate = TextAnchorRangeUpdate;

function mergeCachedDocumentIfNeeded(node: Node) {
  if (isNodeDocumentLoaded(node)) {
    return node;
  }
  const cachedDocument = readCachedWorkspaceNodeDocument(node.id);
  return cachedDocument ? mergeWorkspaceNodeDocument(node, cachedDocument) : node;
}

export function createUpdateHighlightAnchorRangeAction(set: WorkspaceSet) {
  return (highlightNodeId: string, range: HighlightRangeUpdate) => {
    let nextNodeForSync: Node | null = null;
    let unloadedSyncArgs: { parentContent: string; previousLocator: TextAnchorLocator } | null = null;
    set((state) => {
      const node = state.nodesById[highlightNodeId];
      if (!node || state.trashedNodeIds.includes(highlightNodeId)) {
        return state;
      }
      const parentNode = node.parentNodeId ? state.nodesById[node.parentNodeId] : null;
      if (!parentNode) {
        return state;
      }
      const documentNode = mergeCachedDocumentIfNeeded(node);
      const nextNode = buildUpdatedTextAnchorNode({
        node: documentNode,
        parentContent: parentNode.content,
        range,
        timestamp: new Date().toISOString()
      });
      if (!nextNode) {
        return state;
      }
      nextNodeForSync = nextNode;
      if (!isNodeDocumentLoaded(documentNode)) {
        unloadedSyncArgs = node.anchorLink?.locator && isTextAnchorLocator(node.anchorLink.locator)
          ? { parentContent: parentNode.content, previousLocator: node.anchorLink.locator }
          : null;
      }
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
    const syncArgs = unloadedSyncArgs as { parentContent: string; previousLocator: TextAnchorLocator } | null;
    if (syncArgs) {
      void syncUnloadedTextAnchorContent({
        nextNode: nextNodeForSync,
        parentContent: syncArgs.parentContent,
        previousLocator: syncArgs.previousLocator,
        set
      });
    } else {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
