import path from 'node:path';

import { createDesktopDebugTraceAppender, isDesktopDebugProbeEnabled } from './diagnostics/desktopDebugTrace.js';
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
