import { isNodeContentLocked } from '../features/nodes/model/nodeContainers';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import {
  isEditorInputDiagnosticEnabled,
  readEditorInputDiagnosticTime
} from './workspaceEditorInputDiagnostics';
import {
  createUpdateNodeContentLocalState,
  createUpdateNodeContentMetrics,
  logUpdateNodeContentDiagnostic,
  type UpdateNodeContentLocalState,
  type UpdateNodeContentMetrics
} from './workspaceNodeContentUpdateDiagnostics';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentWithAnchorsMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceNode = WorkspaceState['nodesById'][string];

async function applyNodeContentRuntimePatch(args: {
  diagnosticsEnabled: boolean;
  localPatch: Partial<WorkspaceState> | null;
  locatorUpdatedNodesForSync: WorkspaceState['nodesById'][string][];
  metrics: UpdateNodeContentMetrics;
  nextNodeForSync: WorkspaceState['nodesById'][string];
  nodeOrderForSync: string[];
  set: WorkspaceSet;
}) {
  const shouldUseLocalFallback = !hasWorkspaceNodeMutationRuntime();
  const mutationStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const result = await syncNodeContentWithAnchorsMutationToRuntime(
    args.nextNodeForSync,
    args.locatorUpdatedNodesForSync,
    args.nodeOrderForSync
  );
  args.metrics.runtimeMutationMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - mutationStartedAt : 0;
  let applied = false;
  const runtimeSetStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  args.set((state) => {
    const patchBuildStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
    const acceptedPatch = result
      ? createWorkspaceNodeMutationPatch(state, result)
      : shouldUseLocalFallback ? args.localPatch : null;
    if (args.diagnosticsEnabled) {
      args.metrics.patchBuildMs += readEditorInputDiagnosticTime() - patchBuildStartedAt;
    }
    if (!acceptedPatch) return state;
    applied = true;
    return acceptedPatch;
  });
  args.metrics.runtimeSetMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - runtimeSetStartedAt : 0;
  if (applied) {
    const cacheSyncStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
    syncWorkspaceNodeDocumentCacheFromNode(args.nextNodeForSync);
    args.locatorUpdatedNodesForSync.forEach(syncWorkspaceNodeDocumentCacheFromNode);
    args.metrics.runtimeCacheSyncMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - cacheSyncStartedAt : 0;
  }
  return applied;
}

function isNodeContentUpdateBlocked(state: WorkspaceState, nodeId: string, node: WorkspaceNode) {
  return (
    !isNodeDocumentLoaded(node) ||
    isProtectedRootNode(node) ||
    isNodeContentLocked(nodeId, state.nodeOrder, state.nodesById, new Set(state.trashedNodeIds))
  );
}

function prepareNodeContentLocalState(args: {
  content: string;
  diagnosticsEnabled: boolean;
  localState: UpdateNodeContentLocalState;
  metrics: UpdateNodeContentMetrics;
  nodeId: string;
  state: WorkspaceState;
}) {
  const guardStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const node = args.state.nodesById[args.nodeId];
  if (!node || isNodeContentUpdateBlocked(args.state, args.nodeId, node)) {
    args.metrics.wasGuarded = true;
    args.metrics.guardMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - guardStartedAt : 0;
    return args.state;
  }
  args.metrics.guardMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - guardStartedAt : 0;
  const timestamp = new Date().toISOString();
  const nextNode = prepareNextContentNode(node, args.content, timestamp, args);
  const locatorSync = syncTextAnchorLocatorsForNextContentNode(args, nextNode, timestamp, node.content);
  args.localState.nextNodeForSync = nextNode;
  args.localState.locatorUpdatedNodesForSync = locatorSync.updatedNodes;
  args.localState.nodeOrderForSync = args.state.nodeOrder;
  args.localState.localPatch = { nodesById: locatorSync.nextNodesById };
  return args.state;
}

function prepareNextContentNode(
  node: WorkspaceNode,
  content: string,
  timestamp: string,
  args: { diagnosticsEnabled: boolean; metrics: UpdateNodeContentMetrics }
) {
  const nextNodeStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const nextNode = {
    ...node,
    content,
    hasContent: content.trim().length > 0,
    hideTitleHeading: false,
    updatedAt: timestamp
  };
  args.metrics.nextNodeMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - nextNodeStartedAt : 0;
  return nextNode;
}

function syncTextAnchorLocatorsForNextContentNode(
  args: {
    content: string;
    diagnosticsEnabled: boolean;
    metrics: UpdateNodeContentMetrics;
    nodeId: string;
    state: WorkspaceState;
  },
  nextNode: WorkspaceNode,
  timestamp: string,
  previousContent: string
) {
  const cloneStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const nextNodesByIdForLocatorSync = { ...args.state.nodesById, [args.nodeId]: nextNode };
  args.metrics.cloneNodesByIdMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - cloneStartedAt : 0;
  const syncStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const locatorSync = syncTextAnchorLocatorsForParentContent({
    nextContent: args.content,
    nodesById: nextNodesByIdForLocatorSync,
    parentNodeId: args.nodeId,
    previousContent,
    timestamp
  });
  args.metrics.syncMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - syncStartedAt : 0;
  if (locatorSync.diagnostics) {
    args.metrics.syncDiagnostics = locatorSync.diagnostics;
  }
  return locatorSync;
}

function collectUpdateNodeContentLocalState(args: {
  content: string;
  diagnosticsEnabled: boolean;
  metrics: UpdateNodeContentMetrics;
  nodeId: string;
  set: WorkspaceSet;
}) {
  const localState = createUpdateNodeContentLocalState();
  const setStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  args.set((state) => prepareNodeContentLocalState({ ...args, localState, state }));
  args.metrics.setMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - setStartedAt : 0;
  return localState;
}

async function updateNodeContent(set: WorkspaceSet, nodeId: string, content: string) {
  const diagnosticsEnabled = isEditorInputDiagnosticEnabled();
  const metrics = createUpdateNodeContentMetrics(diagnosticsEnabled);
  const localState = collectUpdateNodeContentLocalState({ content, diagnosticsEnabled, metrics, nodeId, set });
  if (!localState.nextNodeForSync) {
    if (diagnosticsEnabled) {
      logUpdateNodeContentDiagnostic({ applied: false, contentLength: content.length, localState, metrics });
    }
    return false;
  }
  const nextNodeForSync = localState.nextNodeForSync;
  const runtimePatchStartedAt = diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const applied = await applyNodeContentRuntimePatch({
    ...localState,
    diagnosticsEnabled,
    metrics,
    nextNodeForSync,
    set
  });
  metrics.runtimePatchMs = diagnosticsEnabled ? readEditorInputDiagnosticTime() - runtimePatchStartedAt : 0;
  if (diagnosticsEnabled) {
    logUpdateNodeContentDiagnostic({ applied, contentLength: content.length, localState, metrics });
  }
  return applied;
}

export function createUpdateNodeContentAction(set: WorkspaceSet): WorkspaceState['updateNodeContent'] {
  return (nodeId, content) => updateNodeContent(set, nodeId, content);
}
