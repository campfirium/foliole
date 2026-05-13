import type { Node } from '../../features/nodes/model/nodeTypes';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

import { resolveContentLength, resolveEmptyContentReady, resolveReady } from './performanceDiagnosticsFlowHelpers';
import {
  POSITION_REQUEST_GRACE_MS,
  createNodeSelectionFlow,
  getFlow,
  recordFlowEvent,
  resolveNodeTitle,
  state
} from './performanceDiagnosticsState';

export function markNodeSelectionRequested(nodeId: string, nodesById: Record<string, Node>) {
  const now = Date.now();
  state.activeFlow = createNodeSelectionFlow({
    appliedAt: null,
    nodeId,
    nodeTitle: resolveNodeTitle(nodesById, nodeId),
    requestedAt: now,
    selectedAt: now,
    timeline: [{ atMs: 0, name: 'selection_requested' }]
  });
}

export function markNodeSelectionApplied(nodeId: string, nodesById: Record<string, Node>) {
  const now = Date.now();
  const existingFlow = state.activeFlow?.nodeId === nodeId ? state.activeFlow : null;
  const flow =
    existingFlow ??
    createNodeSelectionFlow({
      nodeId,
      nodeTitle: resolveNodeTitle(nodesById, nodeId),
      requestedAt: now,
      selectedAt: now
    });
  flow.nodeTitle = resolveNodeTitle(nodesById, nodeId) ?? flow.nodeTitle;
  flow.appliedAt = flow.appliedAt ?? now;
  flow.selectedAt = flow.appliedAt;
  if (!existingFlow) {
    flow.timeline.push({ atMs: 0, name: 'selection_applied' });
  } else {
    recordFlowEvent(flow, 'selection_applied');
  }
  state.activeFlow = flow;
}

export function beginNodeSelectionFlow(nodeId: string, nodesById: Record<string, Node>) {
  const now = Date.now();
  const existingFlow = state.activeFlow?.nodeId === nodeId ? state.activeFlow : null;
  const shouldCarryPendingPosition =
    existingFlow?.positionRequestedAt !== null &&
    existingFlow?.positionReadyAt === null &&
    now - existingFlow.positionRequestedAt <= POSITION_REQUEST_GRACE_MS;

  state.activeFlow = createNodeSelectionFlow({
    appliedAt: existingFlow?.appliedAt ?? now,
    nodeId,
    nodeTitle: resolveNodeTitle(nodesById, nodeId),
    positionRequestedAt: shouldCarryPendingPosition ? existingFlow?.positionRequestedAt ?? null : null,
    requestedAt: existingFlow?.requestedAt ?? existingFlow?.selectedAt ?? now,
    selectedAt: existingFlow?.selectedAt ?? existingFlow?.appliedAt ?? now,
    ...(existingFlow?.timeline ? { timeline: existingFlow.timeline } : {})
  });
  state.activeFlow.lastContentSyncCompletedAt = existingFlow?.lastContentSyncCompletedAt ?? null;
  state.activeFlow.lastContentSyncLength = existingFlow?.lastContentSyncLength ?? null;
  state.activeFlow.panelBoundAt = existingFlow?.panelBoundAt ?? null;
  state.activeFlow.documentLoadStartedAt = existingFlow?.documentLoadStartedAt ?? null;
  state.activeFlow.documentLoadResolvedAt = existingFlow?.documentLoadResolvedAt ?? null;
  state.activeFlow.resolvedContentReadyAt = existingFlow?.resolvedContentReadyAt ?? null;
  state.activeFlow.resolvedReadyAt = existingFlow?.resolvedReadyAt ?? null;
  state.activeFlow.bodyPaintAt = existingFlow?.bodyPaintAt ?? null;
  state.activeFlow.bodyReadyAt = existingFlow?.bodyReadyAt ?? null;
  recordFlowEvent(state.activeFlow, 'flow_started');

  state.nodeDocumentCache.entries = Object.values(nodesById).filter((node) => isNodeDocumentLoaded(node)).length;
  if (isNodeDocumentLoaded(nodesById[nodeId])) {
    state.nodeDocumentCache.hits += 1;
    recordFlowEvent(state.activeFlow, 'node_cache_hit');
    resolveEmptyContentReady(state.activeFlow);
    return;
  }
  state.nodeDocumentCache.misses += 1;
  recordFlowEvent(state.activeFlow, 'node_cache_miss');
}

function markFlowTimestamp(nodeId: string, field: 'bodyReadyAt' | 'bodyPaintAt' | 'documentLoadStartedAt', eventName: string) {
  const flow = getFlow(nodeId);
  if (!flow || flow[field] !== null) {
    return;
  }
  flow[field] = Date.now();
  recordFlowEvent(flow, eventName);
}

export function markNodeBodyReady(nodeId: string) {
  markFlowTimestamp(nodeId, 'bodyReadyAt', 'body_ready');
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  resolveReady(flow);
}

export function markNodeBodyPainted(nodeId: string) {
  markFlowTimestamp(nodeId, 'bodyPaintAt', 'body_painted');
}

export function markNodeDocumentLoadStarted(nodeId: string) {
  markFlowTimestamp(nodeId, 'documentLoadStartedAt', 'document_load_started');
}

export function markNodeDocumentLoadResolved(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  flow.documentLoadStartedAt = flow.documentLoadStartedAt ?? flow.selectedAt;
  flow.documentLoadResolvedAt = flow.documentLoadResolvedAt ?? Date.now();
  recordFlowEvent(flow, 'document_load_resolved');
  resolveReady(flow);
}

function markFlowEventByNode(nodeId: string, eventName: string, detail?: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  recordFlowEvent(flow, eventName, detail);
}

export function markNodeDocumentMerged(nodeId: string, detail?: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  recordFlowEvent(flow, 'document_merged', detail);
  if (resolveContentLength(detail) === 0 && flow.documentLoadResolvedAt !== null) {
    flow.resolvedContentReadyAt = flow.resolvedContentReadyAt ?? flow.documentLoadResolvedAt;
  }
  resolveReady(flow);
}

export function markDocumentPanelBound(nodeId: string, detail?: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  flow.panelBoundAt = flow.panelBoundAt ?? Date.now();
  recordFlowEvent(flow, 'document_panel_bound', detail);
}

export function markEditorContentSyncStarted(nodeId: string, detail?: string) {
  markFlowEventByNode(nodeId, 'editor_content_sync_started', detail);
}

export function markEditorContentSyncCompleted(nodeId: string, detail?: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  flow.lastContentSyncCompletedAt = Date.now();
  flow.lastContentSyncLength = resolveContentLength(detail);
  recordFlowEvent(flow, 'editor_content_sync_completed', detail);
  if ((flow.lastContentSyncLength ?? 0) > 0) {
    flow.resolvedContentReadyAt = flow.resolvedContentReadyAt ?? flow.lastContentSyncCompletedAt;
  }
  resolveReady(flow);
}

export function markSelectionComputation(nodeId: string, name: string, durationMs: number, detail?: string) {
  const suffix = detail ? `|${detail}` : '';
  markFlowEventByNode(nodeId, 'selection_computation', `${name}:${Math.round(durationMs)}ms${suffix}`);
}

export function markSelectionComputationAt(nodeId: string, name: string, atMs: number, durationMs: number, detail?: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  const suffix = detail ? `|${detail}` : '';
  flow.timeline.push({
    atMs: Math.max(0, Math.round(atMs)),
    detail: `${name}:${Math.round(durationMs)}ms${suffix}`,
    name: 'selection_computation'
  });
}

export function markPreviousNodeTrimmed(nodeId: string) {
  markFlowEventByNode(nodeId, 'previous_node_trimmed');
}

export function markNodePositionRequested(nodeId: string) {
  const flow = getFlow(nodeId);
  if (flow) {
    flow.positionRequestedAt = flow.positionRequestedAt ?? Date.now();
    recordFlowEvent(flow, 'position_requested');
    return;
  }

  state.activeFlow = createNodeSelectionFlow({
    appliedAt: null,
    nodeId,
    nodeTitle: null,
    positionRequestedAt: Date.now(),
    requestedAt: Date.now(),
    selectedAt: Date.now(),
    timeline: [{ atMs: 0, name: 'position_requested' }]
  });
}

export function recordNodeListRowRender(renderedNodeId: string) {
  const flow = state.activeFlow;
  if (!flow) {
    return;
  }
  flow.renderedRowCount += 1;
  flow.renderedRowIds.add(renderedNodeId);
}

export function recordComponentRender(name: 'documentPanel' | 'nodeListTree' | 'rightSidebar' | 'workspaceGrid') {
  state.accumulatedComponentRenderCounts[name] += 1;
  const flow = state.activeFlow;
  if (!flow) {
    return;
  }
  flow.componentRenderCounts[name] += 1;
}

export function markNodePositionReady(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  flow.positionRequestedAt = flow.positionRequestedAt ?? Date.now();
  flow.positionReadyAt = flow.positionReadyAt ?? Date.now();
  recordFlowEvent(flow, 'position_ready');
}

export function updateNodeImageState(nodeId: string, totalCount: number, loadedCount: number) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }

  const previousLoadedCount = flow.imageState.loadedCount;
  flow.imageState.totalCount = totalCount;
  flow.imageState.loadedCount = loadedCount;

  if (totalCount === 0) {
    flow.imageState.readyAt = flow.imageState.readyAt ?? flow.bodyReadyAt ?? Date.now();
    recordFlowEvent(flow, 'images_not_required');
    return;
  }
  if (loadedCount > 0) {
    flow.imageState.firstReadyAt = flow.imageState.firstReadyAt ?? Date.now();
    if (previousLoadedCount === loadedCount) {
      return;
    }
    recordFlowEvent(flow, 'image_loaded', `${loadedCount}/${totalCount}`);
  }
  if (loadedCount >= totalCount) {
    flow.imageState.readyAt = flow.imageState.readyAt ?? Date.now();
    recordFlowEvent(flow, 'all_images_ready');
    resolveReady(flow);
    return;
  }
  flow.imageState.readyAt = null;
}
