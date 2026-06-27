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
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStore';
import {
  applyNodeContentLocalPatch,
  scheduleNodeContentRuntimePersist
} from './workspaceStoreContentRuntimePersist';
import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceNode = WorkspaceState['nodesById'][string];

function resolveNodeContentUpdateBlockReason(state: WorkspaceState, nodeId: string, node: WorkspaceNode) {
  if (!isNodeDocumentLoaded(node)) {
    return 'document-not-loaded';
  }
  if (isProtectedRootNode(node)) {
    return 'protected-root-node';
  }
  return null;
}

function prepareNodeContentLocalState(args: {
  buildHeavyPatch: boolean;
  content: string;
  diagnosticsEnabled: boolean;
  localState: UpdateNodeContentLocalState;
  metrics: UpdateNodeContentMetrics;
  nodeId: string;
  state: WorkspaceState;
}) {
  const guardStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const node = args.state.nodesById[args.nodeId];
  if (!node) {
    args.metrics.wasGuarded = true;
    args.metrics.guardReason = 'node-missing';
    args.metrics.guardMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - guardStartedAt : 0;
    return args.state;
  }
  const blockReason = resolveNodeContentUpdateBlockReason(args.state, args.nodeId, node);
  if (blockReason) {
    args.metrics.wasGuarded = true;
    args.metrics.guardReason = blockReason;
    args.metrics.guardMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - guardStartedAt : 0;
    return args.state;
  }
  args.metrics.guardMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - guardStartedAt : 0;
  const timestamp = new Date().toISOString();
  const nextNode = prepareNextContentNode(node, args.content, timestamp, args);
  args.localState.nextNodeForSync = nextNode;
  args.localState.nodeOrderForSync = args.state.nodeOrder;
  if (args.buildHeavyPatch) {
    const locatorSync = syncTextAnchorLocatorsForNextContentNode(args, nextNode, timestamp, node.content);
    args.localState.locatorUpdatedNodesForSync = locatorSync.updatedNodes;
    args.localState.localPatch = { nodesById: locatorSync.nextNodesById };
  }
  return {
    nodesById: {
      ...args.state.nodesById,
      [args.nodeId]: nextNode
    }
  };
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
  buildHeavyPatch: boolean;
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

async function updateNodeContent(
  set: WorkspaceSet,
  nodeId: string,
  content: string,
  options: { publishLocal?: boolean } = {}
) {
  const diagnosticsEnabled = isEditorInputDiagnosticEnabled();
  const metrics = createUpdateNodeContentMetrics(diagnosticsEnabled);
  const publishLocal = options.publishLocal !== false;
  const localState = collectUpdateNodeContentLocalState({
    buildHeavyPatch: publishLocal,
    content,
    diagnosticsEnabled,
    metrics,
    nodeId,
    set
  });
  if (!localState.nextNodeForSync) {
    if (diagnosticsEnabled) {
      logUpdateNodeContentDiagnostic({ applied: false, contentLength: content.length, localState, metrics, nodeId });
    }
    return false;
  }
  const nextNodeForSync = localState.nextNodeForSync;
  const runtimePatchStartedAt = diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const applied = !publishLocal
    ? true
    : applyNodeContentLocalPatch({
      ...localState,
      diagnosticsEnabled,
      metrics,
      nextNodeForSync,
      set
    });
  metrics.runtimePatchMs = diagnosticsEnabled ? readEditorInputDiagnosticTime() - runtimePatchStartedAt : 0;
  scheduleNodeContentRuntimePersist({
    contentLength: content.length,
    diagnosticsEnabled,
    localState,
    metrics,
    nextNodeForSync
  });
  metrics.runtimeAwaitContinuationGapMs = diagnosticsEnabled
    ? metrics.runtimePatchMs - metrics.runtimeApplyTotalMs
    : 0;
  metrics.rendererRuntimeGapMs = diagnosticsEnabled
    ? metrics.runtimePatchMs - metrics.runtimeMutationMs - metrics.runtimeSetMs - metrics.runtimeCacheSyncMs
    : 0;
  if (diagnosticsEnabled) {
    logUpdateNodeContentDiagnostic({ applied, contentLength: content.length, localState, metrics, nodeId });
  }
  return applied;
}

export function createUpdateNodeContentAction(set: WorkspaceSet): WorkspaceState['updateNodeContent'] {
  return (nodeId, content, options) => updateNodeContent(set, nodeId, content, options);
}
