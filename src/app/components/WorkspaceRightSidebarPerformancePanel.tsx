import { useEffect, useMemo, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { readAttachmentResourceCacheStats } from '../../shared/platform/attachmentResources';
import { readPerformanceDiagnosticsProbe } from '../../shared/platform/performanceDiagnosticsProbe';
import { loadRuntimePerformanceMemorySnapshot } from '../../shared/platform/performanceMemoryRuntimeRepository';
import {
  InspectorSection,
  inspectorDefinitionListClassName,
  inspectorDefinitionTermClassName,
  inspectorDefinitionValueClassName
} from '../../shared/ui';
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

function formatBytes(value: number | null, fallback: string) {
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
      <dt className={inspectorDefinitionTermClassName}>{label}</dt>
      <dd className={`${inspectorDefinitionValueClassName} break-all`}>{value}</dd>
    </>
  );
}

export function WorkspaceRightSidebarPerformancePanel(props: WorkspaceRightSidebarPerformancePanelProps) {
  const t = useTranslation();
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
        description={activeNodeTitle ? t('desktop.diagnostics.performance.latestSelection', { title: activeNodeTitle }) : t('desktop.diagnostics.performance.selectNode')}
        contentClassName={inspectorDefinitionListClassName}
        title={t('desktop.diagnostics.performance.timing')}
      >
        <dl className="contents">
          <InfoRow label={t('desktop.diagnostics.performance.realOverall')} value={formatDuration(diagnostics.flow.overallReadyDurationMs, t('desktop.diagnostics.performance.waiting'))} />
          <InfoRow label={t('desktop.diagnostics.performance.clickToSwitch')} value={formatDuration(diagnostics.flow.requestToApplyDurationMs, t('desktop.diagnostics.performance.pending'))} />
          <InfoRow label={t('desktop.diagnostics.performance.panelShown')} value={formatDuration(diagnostics.flow.panelBoundDurationMs, t('desktop.diagnostics.performance.pending'))} />
          <InfoRow label={t('desktop.diagnostics.performance.contentReady')} value={formatDuration(diagnostics.flow.realContentReadyDurationMs, t('desktop.diagnostics.performance.pending'))} />
          <InfoRow label={t('desktop.diagnostics.performance.contentStable')} value={formatDuration(diagnostics.flow.realReadyDurationMs, t('desktop.diagnostics.performance.pending'))} />
          <InfoRow label={t('desktop.diagnostics.performance.shellStable')} value={formatDuration(diagnostics.flow.bodyReadyDurationMs, t('desktop.diagnostics.performance.pending'))} />
          <InfoRow label={t('desktop.diagnostics.performance.loadStart')} value={formatDuration(diagnostics.flow.documentLoadStartDurationMs, t('desktop.diagnostics.performance.hotCache'))} />
          <InfoRow label={t('desktop.diagnostics.performance.loadSpent')} value={formatDuration(diagnostics.flow.documentLoadDurationMs, t('desktop.diagnostics.performance.hotCache'))} />
          <InfoRow label={t('desktop.diagnostics.performance.firstPaint')} value={formatDuration(diagnostics.flow.bodyPaintDurationMs, t('desktop.diagnostics.performance.pending'))} />
          <InfoRow label={t('desktop.diagnostics.performance.positionWait')} value={formatPositionWait(diagnostics.flow.positionStatus, diagnostics.flow.positionWaitDurationMs, t)} />
          <InfoRow label={t('desktop.diagnostics.performance.positionDone')} value={formatPositionDone(diagnostics.flow.positionStatus, diagnostics.flow.positionReadyDurationMs, t)} />
          <InfoRow label={t('desktop.diagnostics.performance.firstImage')} value={formatImageDuration(diagnostics.flow.imageStatus, diagnostics.flow.firstImageReadyDurationMs, t)} />
          <InfoRow label={t('desktop.diagnostics.performance.allImages')} value={formatImageDuration(diagnostics.flow.imageStatus, diagnostics.flow.imagesReadyDurationMs, t)} />
        </dl>
      </InspectorSection>

      <InspectorSection
        contentClassName={inspectorDefinitionListClassName}
        title={t('desktop.diagnostics.performance.memory')}
      >
        <dl className="contents">
          <InfoRow label={t('desktop.diagnostics.performance.knownTotal')} value={formatBytes(memoryTotalBytes, t('desktop.diagnostics.performance.unavailable'))} />
          <InfoRow label={t('desktop.diagnostics.performance.mainProcess')} value={formatBytes(memorySnapshot.mainProcessRssBytes, t('desktop.diagnostics.performance.unavailable'))} />
          <InfoRow label={t('desktop.diagnostics.performance.renderer')} value={formatBytes(memorySnapshot.rendererHeapBytes, t('desktop.diagnostics.performance.unavailable'))} />
          <InfoRow label={t('desktop.diagnostics.performance.textBuffer')} value={formatBytes(loadedNodeStats.textPrefetchBytes, '0.0 MB')} />
          <InfoRow label={t('desktop.diagnostics.performance.loadedTopics')} value={formatCount(loadedNodeStats.loadedNodeCount)} />
        </dl>
      </InspectorSection>
      <CacheSection
        attachmentEntries={attachmentCache.entries}
        cacheTotalEntries={cacheTotalEntries}
        diagnostics={diagnostics}
        loadedNodeCount={loadedNodeStats.loadedNodeCount}
        t={t}
      />
    </div>
  );
}

function CacheSection({
  attachmentEntries,
  cacheTotalEntries,
  diagnostics,
  loadedNodeCount,
  t
}: {
  attachmentEntries: number;
  cacheTotalEntries: number;
  diagnostics: ReturnType<typeof readPerformanceDiagnosticsProbe>;
  loadedNodeCount: number;
  t: Translate;
}) {
  return (
    <InspectorSection
      contentClassName={inspectorDefinitionListClassName}
      title={t('desktop.diagnostics.performance.cache')}
    >
      <dl className="contents">
        <InfoRow label={t('desktop.diagnostics.performance.knownTotal')} value={formatCount(cacheTotalEntries)} />
        <InfoRow label={t('desktop.diagnostics.performance.topicBlocks')} value={formatCount(loadedNodeCount)} />
        <InfoRow label={t('desktop.diagnostics.performance.topicHits')} value={formatCount(diagnostics.nodeDocumentCache.hits)} />
        <InfoRow label={t('desktop.diagnostics.performance.topicMisses')} value={formatCount(diagnostics.nodeDocumentCache.misses)} />
        <InfoRow label={t('desktop.diagnostics.performance.sourceDetails')} value={formatCount(diagnostics.sourceDetailsCache.entries)} />
        <InfoRow label={t('desktop.diagnostics.performance.sourceHits')} value={formatCount(diagnostics.sourceDetailsCache.hits)} />
        <InfoRow label={t('desktop.diagnostics.performance.sourceMisses')} value={formatCount(diagnostics.sourceDetailsCache.misses)} />
        <InfoRow label={t('desktop.diagnostics.performance.pdfSurfaces')} value={formatCount(diagnostics.pdfSurfaceCache.entries)} />
        <InfoRow label={t('desktop.diagnostics.performance.imageResults')} value={formatCount(attachmentEntries)} />
        <InfoRow label={t('desktop.diagnostics.performance.imageHits')} value={formatCount(diagnostics.imageCache.hits)} />
        <InfoRow label={t('desktop.diagnostics.performance.imageMisses')} value={formatCount(diagnostics.imageCache.misses)} />
      </dl>
    </InspectorSection>
  );
}

function formatImageDuration(status: 'done' | 'no-images' | 'pending', value: number | null, t: Translate) {
  if (status === 'no-images') {
    return t('desktop.diagnostics.performance.noImages');
  }
  return formatDuration(value, t('desktop.diagnostics.performance.pending'));
}

function formatPositionDone(status: 'done' | 'not-requested' | 'pending', value: number | null, t: Translate) {
  if (status === 'not-requested') {
    return t('desktop.diagnostics.performance.notTriggered');
  }
  return formatDuration(value, t('desktop.diagnostics.performance.pending'));
}

function formatPositionWait(status: 'done' | 'not-requested' | 'pending', value: number | null, t: Translate) {
  if (status === 'not-requested') {
    return t('desktop.diagnostics.performance.notTriggered');
  }
  return formatDuration(value, t('desktop.diagnostics.performance.pending'));
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
