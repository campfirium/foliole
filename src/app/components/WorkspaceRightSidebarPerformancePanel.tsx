import { useEffect, useMemo, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { readAttachmentResourceCacheStats } from '../../shared/platform/attachmentResources';
import { readPerformanceDiagnosticsProbe } from '../../shared/platform/performanceDiagnosticsProbe';
import { loadRuntimePerformanceMemorySnapshot } from '../../shared/platform/performanceMemoryBridge';
import { InspectorSection } from '../../shared/ui';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

interface WorkspaceRightSidebarPerformancePanelProps {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
}

interface MemorySnapshot {
  mainProcessRssBytes: number | null;
  rendererHeapBytes: number | null;
}

const REFRESH_INTERVAL_MS = 1200;

function formatDuration(value: number | null, fallback: string) {
  return value === null ? fallback : `${Math.max(0, Math.round(value))} ms`;
}

function formatCount(value: number) {
  return String(Math.max(0, value));
}

function formatBytes(value: number | null, fallback = 'Unavailable') {
  return value === null ? fallback : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveRendererHeapBytes() {
  const performanceWithMemory = window.performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
    };
  };
  const value = performanceWithMemory.memory?.usedJSHeapSize;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readLoadedNodeStats(nodesById: Record<string, Node>) {
  return Object.values(nodesById).reduce(
    (result, node) => {
      if (!isNodeDocumentLoaded(node)) {
        return result;
      }
      return {
        loadedNodeCount: result.loadedNodeCount + 1,
        textPrefetchBytes: result.textPrefetchBytes + (node.content.length + (node.reveal?.length ?? 0)) * 2
      };
    },
    {
      loadedNodeCount: 0,
      textPrefetchBytes: 0
    }
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-foreground/55">{label}</dt>
      <dd className="min-w-0 break-all text-right text-foreground">{value}</dd>
    </>
  );
}

export function WorkspaceRightSidebarPerformancePanel(props: WorkspaceRightSidebarPerformancePanelProps) {
  const memorySnapshot = usePerformanceMemorySnapshot();
  useDiagnosticsRefresh();
  const diagnostics = readPerformanceDiagnosticsProbe();
  const attachmentCache = readAttachmentResourceCacheStats();
  const loadedNodeStats = useMemo(() => readLoadedNodeStats(props.nodesById), [props.nodesById]);
  const activeNodeTitle = props.activeNodeId ? props.nodesById[props.activeNodeId]?.title ?? null : null;
  const memoryTotalBytes = sumKnownMemory(memorySnapshot.mainProcessRssBytes, memorySnapshot.rendererHeapBytes);
  const cacheTotalEntries =
    loadedNodeStats.loadedNodeCount +
    attachmentCache.entries +
    diagnostics.pdfSurfaceCache.entries +
    diagnostics.sourceDetailsCache.entries;
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <InspectorSection
        description={activeNodeTitle ? `Latest selection: ${activeNodeTitle}` : 'Select a node to capture the next interaction chain.'}
        contentClassName="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]"
        title="Timing"
      >
        <dl className="contents">
          <InfoRow label="Real overall" value={formatDuration(diagnostics.flow.overallReadyDurationMs, 'Waiting')} />
          <InfoRow label="Click to switch" value={formatDuration(diagnostics.flow.requestToApplyDurationMs, 'Pending')} />
          <InfoRow label="Panel shown" value={formatDuration(diagnostics.flow.panelBoundDurationMs, 'Pending')} />
          <InfoRow label="Content ready" value={formatDuration(diagnostics.flow.realContentReadyDurationMs, 'Pending')} />
          <InfoRow label="Content stable" value={formatDuration(diagnostics.flow.realReadyDurationMs, 'Pending')} />
          <InfoRow label="Shell stable" value={formatDuration(diagnostics.flow.bodyReadyDurationMs, 'Pending')} />
          <InfoRow label="Load start" value={formatDuration(diagnostics.flow.documentLoadStartDurationMs, 'Hot cache')} />
          <InfoRow label="Load spent" value={formatDuration(diagnostics.flow.documentLoadDurationMs, 'Hot cache')} />
          <InfoRow label="First paint" value={formatDuration(diagnostics.flow.bodyPaintDurationMs, 'Pending')} />
          <InfoRow label="Position wait" value={formatPositionWait(diagnostics.flow.positionStatus, diagnostics.flow.positionWaitDurationMs)} />
          <InfoRow label="Position done" value={formatPositionDone(diagnostics.flow.positionStatus, diagnostics.flow.positionReadyDurationMs)} />
          <InfoRow label="First image" value={formatImageDuration(diagnostics.flow.imageStatus, diagnostics.flow.firstImageReadyDurationMs)} />
          <InfoRow label="All images" value={formatImageDuration(diagnostics.flow.imageStatus, diagnostics.flow.imagesReadyDurationMs)} />
        </dl>
      </InspectorSection>

      <InspectorSection
        contentClassName="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]"
        title="Memory"
      >
        <dl className="contents">
          <InfoRow label="Known total" value={formatBytes(memoryTotalBytes)} />
          <InfoRow label="Main process" value={formatBytes(memorySnapshot.mainProcessRssBytes)} />
          <InfoRow label="Renderer" value={formatBytes(memorySnapshot.rendererHeapBytes)} />
          <InfoRow label="Text buffer" value={formatBytes(loadedNodeStats.textPrefetchBytes, '0.0 MB')} />
          <InfoRow label="Loaded nodes" value={formatCount(loadedNodeStats.loadedNodeCount)} />
        </dl>
      </InspectorSection>
      <CacheSection
        attachmentEntries={attachmentCache.entries}
        cacheTotalEntries={cacheTotalEntries}
        diagnostics={diagnostics}
        loadedNodeCount={loadedNodeStats.loadedNodeCount}
      />
    </div>
  );
}

function CacheSection({
  attachmentEntries,
  cacheTotalEntries,
  diagnostics,
  loadedNodeCount
}: {
  attachmentEntries: number;
  cacheTotalEntries: number;
  diagnostics: ReturnType<typeof readPerformanceDiagnosticsProbe>;
  loadedNodeCount: number;
}) {
  return (
    <InspectorSection
      contentClassName="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]"
      title="Cache"
    >
      <dl className="contents">
        <InfoRow label="Known total" value={formatCount(cacheTotalEntries)} />
        <InfoRow label="Node blocks" value={formatCount(loadedNodeCount)} />
        <InfoRow label="Node hits" value={formatCount(diagnostics.nodeDocumentCache.hits)} />
        <InfoRow label="Node misses" value={formatCount(diagnostics.nodeDocumentCache.misses)} />
        <InfoRow label="Source details" value={formatCount(diagnostics.sourceDetailsCache.entries)} />
        <InfoRow label="Source hits" value={formatCount(diagnostics.sourceDetailsCache.hits)} />
        <InfoRow label="Source misses" value={formatCount(diagnostics.sourceDetailsCache.misses)} />
        <InfoRow label="PDF surfaces" value={formatCount(diagnostics.pdfSurfaceCache.entries)} />
        <InfoRow label="Image results" value={formatCount(attachmentEntries)} />
        <InfoRow label="Image hits" value={formatCount(diagnostics.imageCache.hits)} />
        <InfoRow label="Image misses" value={formatCount(diagnostics.imageCache.misses)} />
      </dl>
    </InspectorSection>
  );
}

function formatImageDuration(status: 'done' | 'no-images' | 'pending', value: number | null) {
  if (status === 'no-images') {
    return 'No images';
  }
  return formatDuration(value, 'Pending');
}

function formatPositionDone(status: 'done' | 'not-requested' | 'pending', value: number | null) {
  if (status === 'not-requested') {
    return 'Not triggered';
  }
  return formatDuration(value, 'Pending');
}

function formatPositionWait(status: 'done' | 'not-requested' | 'pending', value: number | null) {
  if (status === 'not-requested') {
    return 'Not triggered';
  }
  return formatDuration(value, 'Pending');
}

function sumKnownMemory(...values: Array<number | null>) {
  const knownValues = values.filter((value): value is number => typeof value === 'number');
  if (knownValues.length === 0) {
    return null;
  }
  return knownValues.reduce((sum, value) => sum + value, 0);
}

function useDiagnosticsRefresh() {
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);
    refresh();
    const timerId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, []);
}

function usePerformanceMemorySnapshot() {
  const [memorySnapshot, setMemorySnapshot] = useState<MemorySnapshot>({
    mainProcessRssBytes: null,
    rendererHeapBytes: resolveRendererHeapBytes()
  });

  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void loadRuntimePerformanceMemorySnapshot().then((snapshot) => {
        if (disposed) {
          return;
        }
        setMemorySnapshot({
          mainProcessRssBytes: snapshot?.main_process_rss_bytes ?? null,
          rendererHeapBytes: resolveRendererHeapBytes()
        });
      });
    };
    refresh();
    const timerId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timerId);
    };
  }, []);

  return memorySnapshot;
}
