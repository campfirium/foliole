import path from 'node:path';

import type { ReadingProgressSnapshot, SaveReadingProgressInput } from './database/readingProgress.js';
import { createDesktopDebugTraceAppender, isDesktopDebugProbeEnabled } from './diagnostics/desktopDebugTrace.js';
import { recordDesktopReadingProgressSummary } from './diagnostics/desktopSupportLog.js';
import { resolveAppPaths } from './ipc/paths.js';

interface ReadingPositionTraceRecord {
  event: string;
  payload: unknown;
  timestamp: number;
}

const fileName = 'reading-position.ndjson';
const appendAppTrace = createDesktopDebugTraceAppender(() => path.join(resolveAppPaths().app_log_dir, fileName));

export function createReadingPositionTraceLogger({ appLogDir }: { appLogDir: string }) {
  const filePath = path.join(appLogDir, fileName);
  return {
    append: createDesktopDebugTraceAppender(() => filePath),
    getFilePath: () => filePath
  };
}

export function appendReadingPositionTraceRecord(record: ReadingPositionTraceRecord) {
  if (!isDesktopDebugProbeEnabled()) return null;
  return appendAppTrace(record);
}

export function traceReadingProgressSave(input: SaveReadingProgressInput) {
  const event = 'reading-progress.db-save';
  recordDesktopReadingProgressSummary(event, () => ({
    hasActiveDocument: input.activeNodeId !== null,
    positions: input.nodeViewStates.length,
    hasActivePosition: input.nodeViewStates.some(state => state.nodeId === input.activeNodeId)
  }));
  if (!isDesktopDebugProbeEnabled()) return;
  appendAppTrace({
    event,
    payload: {
      activeNodeId: input.activeNodeId,
      browseRootNodeId: input.browseRootNodeId ?? null,
      nodeIds: input.nodeViewStates.map(state => state.nodeId),
      scrollTops: input.nodeViewStates.map(state => state.scrollTop),
      updatedAt: input.updatedAt
    },
    timestamp: Date.now()
  });
}

export function traceReadingProgressLoad(snapshot: ReadingProgressSnapshot, positionCount: number) {
  const event = 'reading-progress.db-load';
  recordDesktopReadingProgressSummary(event, () => ({
    hasActiveDocument: snapshot.activeNodeId !== null,
    positions: positionCount,
    hasActivePosition: snapshot.activeNodeId !== null && Object.hasOwn(snapshot.nodeViewStateById, snapshot.activeNodeId)
  }));
  appendReadingPositionTraceRecord({
    event,
    payload: {
      activeNodeId: snapshot.activeNodeId,
      browseRootNodeId: snapshot.browseRootNodeId,
      nodeViewStateCount: positionCount
    },
    timestamp: Date.now()
  });
}
