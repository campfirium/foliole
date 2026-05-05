import type { Node } from '../../features/nodes/model/nodeTypes';

import type {
  FlowDiagnosticsSnapshot,
  FlowTimelineEvent,
  NodeSelectionFlow,
  PerformanceDiagnosticsDebugApi,
  PerformanceDiagnosticsState,
  PerformanceDiagnosticsWindow
} from './performanceDiagnosticsTypes';

export const POSITION_REQUEST_GRACE_MS = 2000;

export const state: PerformanceDiagnosticsState = {
  activeFlow: null,
  imageCache: { entries: 0, hits: 0, misses: 0 },
  nodeDocumentCache: { entries: 0, hits: 0, misses: 0 },
  pdfSurfaceCache: { entries: 0 },
  sourceDetailsCache: { entries: 0, hits: 0, misses: 0 }
};

export function createComponentRenderCounts() {
  return {
    documentPanel: 0,
    nodeListTree: 0,
    rightSidebar: 0,
    workspaceGrid: 0
  };
}

export function createImageState() {
  return {
    firstReadyAt: null,
    loadedCount: 0,
    readyAt: null,
    totalCount: 0
  };
}

export function createNodeSelectionFlow(args: {
  appliedAt?: number | null;
  nodeId: string;
  nodeTitle: string | null;
  positionRequestedAt?: number | null;
  requestedAt?: number;
  selectedAt: number;
  timeline?: FlowTimelineEvent[];
}) {
  return {
    appliedAt: args.appliedAt === undefined ? args.selectedAt : args.appliedAt,
    bodyPaintAt: null,
    bodyReadyAt: null,
    componentRenderCounts: createComponentRenderCounts(),
    documentLoadResolvedAt: null,
    documentLoadStartedAt: null,
    imageState: createImageState(),
    lastContentSyncCompletedAt: null,
    lastContentSyncLength: null,
    nodeId: args.nodeId,
    nodeTitle: args.nodeTitle,
    panelBoundAt: null,
    positionReadyAt: null,
    positionRequestedAt: args.positionRequestedAt ?? null,
    renderedRowCount: 0,
    renderedRowIds: new Set<string>(),
    requestedAt: args.requestedAt ?? args.selectedAt,
    resolvedContentReadyAt: null,
    resolvedReadyAt: null,
    selectedAt: args.selectedAt,
    timeline: args.timeline ? [...args.timeline] : []
  } satisfies NodeSelectionFlow;
}

export function isPerformanceDebugEnabled() {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean((window as PerformanceDiagnosticsWindow).electronAPI?.debug);
}

export function getFlow(nodeId: string | null) {
  if (!nodeId || state.activeFlow?.nodeId !== nodeId) {
    return null;
  }
  return state.activeFlow;
}

export function recordFlowEvent(flow: NodeSelectionFlow, name: string, detail?: string) {
  flow.timeline.push({
    atMs: Math.max(0, Date.now() - flow.requestedAt),
    ...(detail ? { detail } : {}),
    name
  });
}

function createEmptyFlowSnapshot(): FlowDiagnosticsSnapshot {
  return {
    bodyPaintDurationMs: null,
    bodyReadyDurationMs: null,
    componentRenderCounts: createComponentRenderCounts(),
    documentLoadDurationMs: null,
    documentLoadStartDurationMs: null,
    firstImageReadyDurationMs: null,
    imageStatus: 'pending',
    imagesReadyDurationMs: null,
    nodeId: null,
    nodeTitle: null,
    panelBoundDurationMs: null,
    overallReadyDurationMs: null,
    realContentReadyDurationMs: null,
    realReadyDurationMs: null,
    requestToApplyDurationMs: null,
    requestedAt: null,
    positionStatus: 'not-requested',
    positionWaitDurationMs: null,
    positionReadyDurationMs: null,
    renderedRowCount: 0,
    renderedRowUniqueCount: 0,
    selectionAppliedAt: null,
    selectedAt: null,
    timeline: []
  };
}

function resolveDuration(at: number | null, selectedAt: number) {
  return at === null ? null : Math.max(0, at - selectedAt);
}

function resolvePositionStatus(flow: NodeSelectionFlow) {
  if (flow.positionRequestedAt === null) {
    return 'not-requested';
  }
  return flow.positionReadyAt === null ? 'pending' : 'done';
}

function resolveImageStatus(flow: NodeSelectionFlow) {
  if (flow.imageState.totalCount === 0) {
    return 'no-images';
  }
  return flow.imageState.readyAt === null ? 'pending' : 'done';
}

export function resolveFlowSnapshot(flow: NodeSelectionFlow | null): FlowDiagnosticsSnapshot {
  if (!flow) {
    return createEmptyFlowSnapshot();
  }

  const bodyPaintDurationMs = resolveDuration(flow.bodyPaintAt, flow.requestedAt);
  const bodyReadyDurationMs = resolveDuration(flow.bodyReadyAt, flow.requestedAt);
  const documentLoadStartDurationMs = resolveDuration(flow.documentLoadStartedAt, flow.requestedAt);
  const documentLoadDurationMs =
    flow.documentLoadStartedAt === null || flow.documentLoadResolvedAt === null
      ? null
      : Math.max(0, flow.documentLoadResolvedAt - flow.documentLoadStartedAt);
  const firstImageReadyDurationMs = resolveDuration(flow.imageState.firstReadyAt, flow.requestedAt);
  const panelBoundDurationMs = resolveDuration(flow.panelBoundAt, flow.requestedAt);
  const positionWaitDurationMs = resolveDuration(flow.positionRequestedAt, flow.requestedAt);
  const positionReadyDurationMs = resolveDuration(flow.positionReadyAt, flow.requestedAt);
  const realContentReadyDurationMs = resolveDuration(flow.resolvedContentReadyAt, flow.requestedAt);
  const realReadyDurationMs = resolveDuration(flow.resolvedReadyAt, flow.requestedAt);
  const imagesReadyDurationMs = resolveDuration(flow.imageState.readyAt, flow.requestedAt);
  const requestToApplyDurationMs =
    flow.appliedAt === null ? null : Math.max(0, flow.appliedAt - flow.requestedAt);
  const overallReadyDurationMs = Math.max(realReadyDurationMs ?? 0, positionReadyDurationMs ?? 0, imagesReadyDurationMs ?? 0);

  return {
    bodyPaintDurationMs,
    bodyReadyDurationMs,
    componentRenderCounts: { ...flow.componentRenderCounts },
    documentLoadDurationMs,
    documentLoadStartDurationMs,
    firstImageReadyDurationMs,
    imageStatus: resolveImageStatus(flow),
    imagesReadyDurationMs,
    nodeId: flow.nodeId,
    nodeTitle: flow.nodeTitle,
    panelBoundDurationMs,
    overallReadyDurationMs: overallReadyDurationMs > 0 ? overallReadyDurationMs : bodyReadyDurationMs,
    realContentReadyDurationMs,
    realReadyDurationMs,
    requestToApplyDurationMs,
    requestedAt: new Date(flow.requestedAt).toISOString(),
    positionStatus: resolvePositionStatus(flow),
    positionWaitDurationMs,
    positionReadyDurationMs,
    renderedRowCount: flow.renderedRowCount,
    renderedRowUniqueCount: flow.renderedRowIds.size,
    selectionAppliedAt: flow.appliedAt === null ? null : new Date(flow.appliedAt).toISOString(),
    selectedAt: new Date(flow.selectedAt).toISOString(),
    timeline: [...flow.timeline]
  };
}

export function ensurePerformanceDiagnosticsDebugApi(readSnapshot: PerformanceDiagnosticsDebugApi['getSnapshot'], reset: () => void) {
  if (!isPerformanceDebugEnabled() || typeof window === 'undefined') {
    return null;
  }

  const targetWindow = window as PerformanceDiagnosticsWindow;
  if (targetWindow.__foliolePerformanceDebug) {
    return targetWindow.__foliolePerformanceDebug;
  }

  const api: PerformanceDiagnosticsDebugApi = { getSnapshot: readSnapshot, reset };
  targetWindow.__foliolePerformanceDebug = api;
  return api;
}

export function readPerformanceDiagnosticsProbe() {
  ensurePerformanceDiagnosticsDebugApi(readPerformanceDiagnosticsProbe, resetPerformanceDiagnosticsProbe);
  return {
    flow: resolveFlowSnapshot(state.activeFlow),
    imageCache: { ...state.imageCache },
    nodeDocumentCache: { ...state.nodeDocumentCache },
    pdfSurfaceCache: { ...state.pdfSurfaceCache },
    sourceDetailsCache: { ...state.sourceDetailsCache }
  };
}

export function updateImageCacheStats(snapshot: { entries: number; hit: boolean }) {
  state.imageCache.entries = snapshot.entries;
  if (snapshot.hit) {
    state.imageCache.hits += 1;
    return;
  }
  state.imageCache.misses += 1;
}

export function updatePdfSurfaceCacheStats(snapshot: { entries: number }) {
  state.pdfSurfaceCache.entries = snapshot.entries;
}

export function updateSourceDetailsCacheStats(snapshot: { entries: number; hit: boolean }) {
  state.sourceDetailsCache.entries = snapshot.entries;
  if (snapshot.hit) {
    state.sourceDetailsCache.hits += 1;
    return;
  }
  state.sourceDetailsCache.misses += 1;
}

export function resetPerformanceDiagnosticsProbe() {
  ensurePerformanceDiagnosticsDebugApi(readPerformanceDiagnosticsProbe, resetPerformanceDiagnosticsProbe);
  state.activeFlow = null;
  state.imageCache = { entries: 0, hits: 0, misses: 0 };
  state.nodeDocumentCache = { entries: 0, hits: 0, misses: 0 };
  state.pdfSurfaceCache = { entries: 0 };
  state.sourceDetailsCache = { entries: 0, hits: 0, misses: 0 };
}

export function resolveNodeTitle(nodesById: Record<string, Node>, nodeId: string) {
  return nodesById[nodeId]?.title ?? null;
}
