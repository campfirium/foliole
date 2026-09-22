import { markNodeSelectionApplied } from '../shared/platform/performanceDiagnosticsProbe';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import {
  resolveWorkspaceBrowseRootForTarget,
  type WorkspaceBrowseRootIntent
} from './workspaceBrowseRoot';
import { isCanonicalTrashedNodeId, isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { pushNavigationHistory } from './workspaceNavigation';
import {
  discardCachedWorkspaceNodeDocumentResult,
  isWorkspaceNodeDocumentResultCurrent,
  loadWorkspaceNodeDocument,
  shouldSkipNodeDocumentPreparation
} from './workspaceNodeDocumentLoader';
import type { WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { RECENT_RENDERER_BOUNDARY_NODE_LIMIT } from './workspaceRendererBoundaryKeepNodeIds';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { useWorkspaceStore } from './workspaceStore';

interface EnsureWorkspaceNodeDocumentReadyOptions {
  browseRootIntent?: WorkspaceBrowseRootIntent;
  forceLoad?: boolean;
  includeTrashed?: boolean;
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
  let accepted = false;
  let merged = false;
  useWorkspaceStore.setState((state) => {
    const nextNode = state.nodesById[nodeId];
    if (
      !isWorkspaceNodeDocumentLoadAllowed(state, nodeId, options)
      || !nextNode
      || !isWorkspaceNodeDocumentResultCurrent(nodeId, document)
    ) {
      return state;
    }
    accepted = true;
    if (!options.forceLoad && isNodeDocumentLoaded(nextNode)) {
      return state;
    }
    merged = true;

    return {
      nodesById: patchWorkspaceRecord(state.nodesById, {
        [nodeId]: mergeWorkspaceNodeDocument(nextNode, document)
      }),
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
  if (!accepted) {
    discardCachedWorkspaceNodeDocumentResult(nodeId, document);
  }
  if (merged) {
    options.onDocumentMerged?.(document);
  }
  return { accepted, merged };
}

function buildPreparedOpenState(
  state: WorkspaceState,
  nodeId: string,
  document: WorkspaceNodeDocument | null,
  options: EnsureWorkspaceNodeDocumentReadyOptions
): WorkspaceState | Partial<WorkspaceState> {
  const targetNode = state.nodesById[nodeId];
  if (!targetNode || !isWorkspaceNodeVisible(state, nodeId)) {
    return state;
  }

  const mergedTargetNode =
    document && (options.forceLoad || !isNodeDocumentLoaded(targetNode))
      ? mergeWorkspaceNodeDocument(targetNode, document)
      : targetNode;
  const nextNodesById =
    mergedTargetNode === targetNode
      ? state.nodesById
      : patchWorkspaceRecord(state.nodesById, { [nodeId]: mergedTargetNode });
  const nextBrowseRootNodeId = resolveWorkspaceBrowseRootForTarget({
    browseRootNodeId: state.browseRootNodeId,
    intent: options.browseRootIntent ?? 'target-context',
    nodesById: nextNodesById,
    targetNodeId: nodeId,
    trashedNodeIds: state.trashedNodeIds
  });

  if (state.activeNodeId === nodeId) {
    return nextNodesById === state.nodesById && nextBrowseRootNodeId === state.browseRootNodeId
      ? state
      : {
          browseRootNodeId: nextBrowseRootNodeId,
          nodesById: nextNodesById
        };
  }

  markNodeSelectionApplied(nodeId, nextNodesById);

  return {
    activeNodeId: nodeId,
    browseRootNodeId: nextBrowseRootNodeId,
    navigation: state.activeNodeId
      ? {
          backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId),
          forwardStack: []
        }
      : { ...state.navigation, forwardStack: [] },
    nodesById: nextNodesById,
    reviewSession: reconcileReviewSession({
      ...state,
      nodesById: nextNodesById
    }, nodeId),
    rendererBoundaryKeepNodeIds: [
      ...(state.activeNodeId ? [state.activeNodeId] : []),
      ...state.rendererBoundaryKeepNodeIds.filter((keepNodeId) => keepNodeId !== state.activeNodeId && keepNodeId !== nodeId)
    ].slice(0, RECENT_RENDERER_BOUNDARY_NODE_LIMIT)
  };
}

function isWorkspaceNodeVisible(state: WorkspaceState, nodeId: string) {
  return isCanonicalVisibleNodeId({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds
  }, nodeId);
}

function isWorkspaceNodeDocumentLoadAllowed(state: WorkspaceState, nodeId: string, options: EnsureWorkspaceNodeDocumentReadyOptions) {
  if (isWorkspaceNodeVisible(state, nodeId)) {
    return true;
  }
  return Boolean(
    options.includeTrashed &&
    isCanonicalTrashedNodeId({
      nodeOrder: state.nodeOrder,
      nodesById: state.nodesById,
      trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
      trashedNodeIds: state.trashedNodeIds
    }, nodeId)
  );
}

export async function ensureWorkspaceNodeDocumentReady(
  nodeId: string,
  options: EnsureWorkspaceNodeDocumentReadyOptions = {}
) {
  if (!isWorkspaceNodeDocumentLoadAllowed(useWorkspaceStore.getState(), nodeId, options)) {
    return null;
  }
  if (!options.forceLoad && shouldSkipNodeDocumentPreparation(nodeId)) {
    return null;
  }

  const document = await loadWorkspaceNodeDocument(nodeId, options);
  if (!document) {
    return null;
  }

  return mergePreparedNodeDocument(nodeId, document, options).accepted ? document : null;
}

export async function openWorkspaceNodeWithPreparedDocument(
  nodeId: string,
  options: EnsureWorkspaceNodeDocumentReadyOptions = {}
) {
  if (!isWorkspaceNodeVisible(useWorkspaceStore.getState(), nodeId)) {
    return null;
  }
  const document = !options.forceLoad && shouldSkipNodeDocumentPreparation(nodeId)
    ? options.preloadedDocument ?? null
    : await loadWorkspaceNodeDocument(nodeId, options);
  if (options.shouldApply && !options.shouldApply()) {
    return null;
  }
  let documentAccepted = document === null;
  let documentMerged = false;
  let selectionApplied = false;
  useWorkspaceStore.setState((state) => {
    if (!isWorkspaceNodeVisible(state, nodeId)) {
      return state;
    }
    selectionApplied = true;
    const acceptedDocument = document && isWorkspaceNodeDocumentResultCurrent(nodeId, document)
      ? document
      : null;
    documentAccepted = document === null || acceptedDocument !== null;
    documentMerged = Boolean(
      acceptedDocument && (options.forceLoad || !isNodeDocumentLoaded(state.nodesById[nodeId]))
    );
    return buildPreparedOpenState(state, nodeId, acceptedDocument, options);
  });
  if (document && !documentAccepted) {
    discardCachedWorkspaceNodeDocumentResult(nodeId, document);
  }
  if (document && documentMerged) {
    options.onDocumentMerged?.(document);
  }
  return selectionApplied ? { focusAnchor: null, nodeId } : null;
}
