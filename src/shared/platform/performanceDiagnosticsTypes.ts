export interface FlowTimelineEvent {
  atMs: number;
  detail?: string;
  name: string;
}

export interface FlowDiagnosticsSnapshot {
  bodyPaintDurationMs: number | null;
  bodyReadyDurationMs: number | null;
  componentRenderCounts: {
    documentPanel: number;
    nodeListTree: number;
    rightSidebar: number;
    workspaceGrid: number;
  };
  documentLoadDurationMs: number | null;
  documentLoadStartDurationMs: number | null;
  firstImageReadyDurationMs: number | null;
  imageStatus: 'done' | 'no-images' | 'pending';
  imagesReadyDurationMs: number | null;
  nodeId: string | null;
  nodeTitle: string | null;
  panelBoundDurationMs: number | null;
  overallReadyDurationMs: number | null;
  realContentReadyDurationMs: number | null;
  realReadyDurationMs: number | null;
  requestToApplyDurationMs: number | null;
  requestedAt: string | null;
  positionStatus: 'done' | 'not-requested' | 'pending';
  positionWaitDurationMs: number | null;
  positionReadyDurationMs: number | null;
  renderedRowCount: number;
  renderedRowUniqueCount: number;
  selectionAppliedAt: string | null;
  selectedAt: string | null;
  timeline: FlowTimelineEvent[];
}

export interface NodeSelectionFlow {
  appliedAt: number | null;
  bodyPaintAt: number | null;
  bodyReadyAt: number | null;
  componentRenderCounts: {
    documentPanel: number;
    nodeListTree: number;
    rightSidebar: number;
    workspaceGrid: number;
  };
  documentLoadResolvedAt: number | null;
  documentLoadStartedAt: number | null;
  imageState: {
    firstReadyAt: number | null;
    loadedCount: number;
    readyAt: number | null;
    totalCount: number;
  };
  lastContentSyncCompletedAt: number | null;
  lastContentSyncLength: number | null;
  nodeId: string;
  nodeTitle: string | null;
  panelBoundAt: number | null;
  positionReadyAt: number | null;
  positionRequestedAt: number | null;
  renderedRowIds: Set<string>;
  renderedRowCount: number;
  requestedAt: number;
  resolvedContentReadyAt: number | null;
  resolvedReadyAt: number | null;
  selectedAt: number;
  timeline: FlowTimelineEvent[];
}

export interface PerformanceDiagnosticsState {
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

export type PerformanceDiagnosticsDebugApi = {
  getSnapshot: () => { flow: FlowDiagnosticsSnapshot } & Omit<PerformanceDiagnosticsState, 'activeFlow'>;
  reset: () => void;
};

export type PerformanceDiagnosticsWindow = Window & {
  electronAPI?: { debug?: unknown };
  __foliolePerformanceDebug?: PerformanceDiagnosticsDebugApi;
};
