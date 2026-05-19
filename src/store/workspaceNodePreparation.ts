import { markNodeSelectionApplied } from '../shared/platform/performanceDiagnosticsProbe';

import { pushNavigationHistory } from './workspaceNavigation';
import { writeCachedWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import { loadWorkspaceNodeDocument, shouldSkipNodeDocumentPreparation } from './workspaceNodeDocumentLoader';
import type { WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { RECENT_RENDERER_BOUNDARY_NODE_LIMIT } from './workspaceRendererBoundaryKeepNodeIds';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { useWorkspaceStore } from './workspaceStore';

interface EnsureWorkspaceNodeDocumentReadyOptions {
  forceLoad?: boolean;
  keepWarm?: boolean;
  onDocumentMerged?: (document: WorkspaceNodeDocument) => void;
  onLoadResolved?: (document: WorkspaceNodeDocument) => void;
  onLoadStarted?: () => void;
  preloadedDocument?: WorkspaceNodeDocument | null;
  shouldApply?: () => boolean;
}

function mergePreparedNodeDocument(
  nodeId: string,
  document: WorkspaceNodeDocument,
  options: EnsureWorkspaceNodeDocumentReadyOptions
) {
  useWorkspaceStore.setState((state) => {
    const nextNode = state.nodesById[nodeId];
    if (!nextNode || isNodeDocumentLoaded(nextNode)) {
      return state;
    }

    return {
      nodesById: {
        ...state.nodesById,
        [nodeId]: mergeWorkspaceNodeDocument(nextNode, document)
      },
      ...(options.keepWarm
        ? {
            rendererBoundaryKeepNodeIds: [
              nodeId,
              ...state.rendererBoundaryKeepNodeIds.filter((keepNodeId) => keepNodeId !== nodeId)
            ].slice(0, RECENT_RENDERER_BOUNDARY_NODE_LIMIT)
          }
        : {})
    };
  });
  writeCachedWorkspaceNodeDocument(nodeId, document);
  options.onDocumentMerged?.(document);
}

function buildPreparedOpenState(
  state: WorkspaceState,
  nodeId: string,
  document: WorkspaceNodeDocument | null
): WorkspaceState {
  const targetNode = state.nodesById[nodeId];
  if (!targetNode || state.trashedNodeIds.includes(nodeId)) {
    return state;
  }

  const mergedTargetNode =
    document && !isNodeDocumentLoaded(targetNode) ? mergeWorkspaceNodeDocument(targetNode, document) : targetNode;
  const nextNodesById =
    mergedTargetNode === targetNode
      ? state.nodesById
      : {
          ...state.nodesById,
          [nodeId]: mergedTargetNode
        };

  if (state.activeNodeId === nodeId && nextNodesById === state.nodesById) {
    return state;
  }

  markNodeSelectionApplied(nodeId, nextNodesById);

  return {
    ...state,
    activeNodeId: nodeId,
    navigation: state.activeNodeId
      ? {
          backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId),
          forwardStack: []
        }
      : { ...state.navigation, forwardStack: [] },
    nodesById: nextNodesById,
    reviewSession: reconcileReviewSession(
      {
        ...state,
        nodesById: nextNodesById
      },
      nodeId
    ),
    rendererBoundaryKeepNodeIds: [
      ...(state.activeNodeId ? [state.activeNodeId] : []),
      ...state.rendererBoundaryKeepNodeIds.filter((keepNodeId) => keepNodeId !== state.activeNodeId && keepNodeId !== nodeId)
    ].slice(0, RECENT_RENDERER_BOUNDARY_NODE_LIMIT)
  };
}

export async function ensureWorkspaceNodeDocumentReady(
  nodeId: string,
  options: EnsureWorkspaceNodeDocumentReadyOptions = {}
) {
  if (!options.forceLoad && shouldSkipNodeDocumentPreparation(nodeId)) {
    return null;
  }

  const document = await loadWorkspaceNodeDocument(nodeId, options);
  if (!document) {
    return null;
  }

  mergePreparedNodeDocument(nodeId, document, options);
  return document;
}

export async function openWorkspaceNodeWithPreparedDocument(
  nodeId: string,
  options: EnsureWorkspaceNodeDocumentReadyOptions = {}
) {
  const document = !options.forceLoad && shouldSkipNodeDocumentPreparation(nodeId)
    ? options.preloadedDocument ?? null
    : await loadWorkspaceNodeDocument(nodeId, options);
  if (options.shouldApply && !options.shouldApply()) {
    return null;
  }
  useWorkspaceStore.setState((state) => buildPreparedOpenState(state, nodeId, document));
  if (document) {
    writeCachedWorkspaceNodeDocument(nodeId, document);
    options.onDocumentMerged?.(document);
  }
  return { focusAnchor: null, nodeId };
}
