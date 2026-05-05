import type { Node } from '../../features/nodes/model/nodeTypes';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

export interface FlowDiagnosticsSnapshot {
  bodyPaintDurationMs: number | null;
  bodyReadyDurationMs: number | null;
  documentLoadDurationMs: number | null;
  documentLoadStartDurationMs: number | null;
  firstImageReadyDurationMs: number | null;
  imageStatus: 'done' | 'no-images' | 'pending';
  imagesReadyDurationMs: number | null;
  nodeId: string | null;
  nodeTitle: string | null;
  overallReadyDurationMs: number | null;
  positionStatus: 'done' | 'not-requested' | 'pending';
  positionWaitDurationMs: number | null;
  positionReadyDurationMs: number | null;
  selectedAt: string | null;
}

interface NodeSelectionFlow {
  bodyPaintAt: number | null;
  bodyReadyAt: number | null;
  documentLoadResolvedAt: number | null;
  documentLoadStartedAt: number | null;
  imageState: {
    firstReadyAt: number | null;
    loadedCount: number;
    readyAt: number | null;
    totalCount: number;
  };
  nodeId: string;
  nodeTitle: string | null;
  positionReadyAt: number | null;
  positionRequestedAt: number | null;
  selectedAt: number;
}

interface PerformanceDiagnosticsState {
  activeFlow: NodeSelectionFlow | null;
  imageCache: {
    entries: number;
    hits: number;
    misses: number;
  };
  nodeDocumentCache: {
    entries: number;
    hits: number;
    misses: number;
  };
  pdfSurfaceCache: {
    entries: number;
  };
  sourceDetailsCache: {
    entries: number;
    hits: number;
    misses: number;
  };
}

const POSITION_REQUEST_GRACE_MS = 2000;

const state: PerformanceDiagnosticsState = {
  activeFlow: null,
  imageCache: {
    entries: 0,
    hits: 0,
    misses: 0
  },
  nodeDocumentCache: {
    entries: 0,
    hits: 0,
    misses: 0
  },
  pdfSurfaceCache: {
    entries: 0
  },
  sourceDetailsCache: {
    entries: 0,
    hits: 0,
    misses: 0
  }
};

function getFlow(nodeId: string | null) {
  if (!nodeId || state.activeFlow?.nodeId !== nodeId) {
    return null;
  }
  return state.activeFlow;
}

function resolveFlowSnapshot(flow: NodeSelectionFlow | null): FlowDiagnosticsSnapshot {
  if (!flow) {
    return {
      bodyPaintDurationMs: null,
      bodyReadyDurationMs: null,
      documentLoadDurationMs: null,
      documentLoadStartDurationMs: null,
      firstImageReadyDurationMs: null,
      imageStatus: 'pending',
      imagesReadyDurationMs: null,
      nodeId: null,
      nodeTitle: null,
      overallReadyDurationMs: null,
      positionStatus: 'not-requested',
      positionWaitDurationMs: null,
      positionReadyDurationMs: null,
      selectedAt: null
    };
  }

  const bodyPaintDurationMs = flow.bodyPaintAt === null ? null : Math.max(0, flow.bodyPaintAt - flow.selectedAt);
  const bodyReadyDurationMs = flow.bodyReadyAt === null ? null : Math.max(0, flow.bodyReadyAt - flow.selectedAt);
  const documentLoadStartDurationMs =
    flow.documentLoadStartedAt === null ? null : Math.max(0, flow.documentLoadStartedAt - flow.selectedAt);
  const documentLoadDurationMs =
    flow.documentLoadStartedAt === null || flow.documentLoadResolvedAt === null
      ? null
      : Math.max(0, flow.documentLoadResolvedAt - flow.documentLoadStartedAt);
  const firstImageReadyDurationMs =
    flow.imageState.firstReadyAt === null ? null : Math.max(0, flow.imageState.firstReadyAt - flow.selectedAt);
  const positionStatus = flow.positionRequestedAt === null ? 'not-requested' : flow.positionReadyAt === null ? 'pending' : 'done';
  const positionWaitDurationMs =
    flow.positionRequestedAt === null ? null : Math.max(0, flow.positionRequestedAt - flow.selectedAt);
  const positionReadyDurationMs =
    flow.positionReadyAt === null ? null : Math.max(0, flow.positionReadyAt - flow.selectedAt);
  const imageStatus =
    flow.imageState.totalCount === 0
      ? 'no-images'
      : flow.imageState.readyAt === null
        ? 'pending'
        : 'done';
  const imagesReadyDurationMs =
    flow.imageState.readyAt === null ? null : Math.max(0, flow.imageState.readyAt - flow.selectedAt);
  const overallReadyDurationMs = Math.max(
    bodyReadyDurationMs ?? 0,
    positionReadyDurationMs ?? 0,
    imagesReadyDurationMs ?? 0
  );

  return {
    bodyPaintDurationMs,
    bodyReadyDurationMs,
    documentLoadDurationMs,
    documentLoadStartDurationMs,
    firstImageReadyDurationMs,
    imageStatus,
    imagesReadyDurationMs,
    nodeId: flow.nodeId,
    nodeTitle: flow.nodeTitle,
    overallReadyDurationMs: overallReadyDurationMs > 0 ? overallReadyDurationMs : bodyReadyDurationMs,
    positionStatus,
    positionWaitDurationMs,
    positionReadyDurationMs,
    selectedAt: new Date(flow.selectedAt).toISOString()
  };
}

export function beginNodeSelectionFlow(nodeId: string, nodesById: Record<string, Node>) {
  const now = Date.now();
  const existingFlow = state.activeFlow?.nodeId === nodeId ? state.activeFlow : null;
  const shouldCarryPendingPosition =
    existingFlow?.positionRequestedAt !== null &&
    existingFlow?.positionReadyAt === null &&
    now - existingFlow.positionRequestedAt <= POSITION_REQUEST_GRACE_MS;

  state.activeFlow = {
    bodyPaintAt: null,
    bodyReadyAt: null,
    documentLoadResolvedAt: null,
    documentLoadStartedAt: null,
    imageState: {
      firstReadyAt: null,
      loadedCount: 0,
      readyAt: null,
      totalCount: 0
    },
    nodeId,
    nodeTitle: nodesById[nodeId]?.title ?? null,
    positionReadyAt: null,
    positionRequestedAt: shouldCarryPendingPosition ? existingFlow?.positionRequestedAt ?? null : null,
    selectedAt: now
  };

  state.nodeDocumentCache.entries = Object.values(nodesById).filter((node) => isNodeDocumentLoaded(node)).length;
  if (isNodeDocumentLoaded(nodesById[nodeId])) {
    state.nodeDocumentCache.hits += 1;
  } else {
    state.nodeDocumentCache.misses += 1;
  }
}

export function markNodeBodyReady(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow || flow.bodyReadyAt !== null) {
    return;
  }
  flow.bodyReadyAt = Date.now();
}

export function markNodeBodyPainted(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow || flow.bodyPaintAt !== null) {
    return;
  }
  flow.bodyPaintAt = Date.now();
}

export function markNodeDocumentLoadStarted(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow || flow.documentLoadStartedAt !== null) {
    return;
  }
  flow.documentLoadStartedAt = Date.now();
}

export function markNodeDocumentLoadResolved(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  flow.documentLoadStartedAt = flow.documentLoadStartedAt ?? flow.selectedAt;
  flow.documentLoadResolvedAt = flow.documentLoadResolvedAt ?? Date.now();
}

export function markNodePositionRequested(nodeId: string) {
  const flow = getFlow(nodeId);
  if (flow) {
    flow.positionRequestedAt = flow.positionRequestedAt ?? Date.now();
    return;
  }
  state.activeFlow = {
    bodyPaintAt: null,
    bodyReadyAt: null,
    documentLoadResolvedAt: null,
    documentLoadStartedAt: null,
    imageState: {
      firstReadyAt: null,
      loadedCount: 0,
      readyAt: null,
      totalCount: 0
    },
    nodeId,
    nodeTitle: null,
    positionReadyAt: null,
    positionRequestedAt: Date.now(),
    selectedAt: Date.now()
  };
}

export function markNodePositionReady(nodeId: string) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }
  flow.positionRequestedAt = flow.positionRequestedAt ?? Date.now();
  flow.positionReadyAt = flow.positionReadyAt ?? Date.now();
}

export function updateNodeImageState(nodeId: string, totalCount: number, loadedCount: number) {
  const flow = getFlow(nodeId);
  if (!flow) {
    return;
  }

  flow.imageState.totalCount = totalCount;
  flow.imageState.loadedCount = loadedCount;

  if (totalCount === 0) {
    flow.imageState.readyAt = flow.imageState.readyAt ?? flow.bodyReadyAt ?? Date.now();
    return;
  }

  if (loadedCount > 0) {
    flow.imageState.firstReadyAt = flow.imageState.firstReadyAt ?? Date.now();
  }

  if (loadedCount >= totalCount) {
    flow.imageState.readyAt = flow.imageState.readyAt ?? Date.now();
    return;
  }

  flow.imageState.readyAt = null;
}

export function readPerformanceDiagnosticsProbe() {
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
  state.activeFlow = null;
  state.imageCache = {
    entries: 0,
    hits: 0,
    misses: 0
  };
  state.nodeDocumentCache = {
    entries: 0,
    hits: 0,
    misses: 0
  };
  state.pdfSurfaceCache = {
    entries: 0
  };
  state.sourceDetailsCache = {
    entries: 0,
    hits: 0,
    misses: 0
  };
}
