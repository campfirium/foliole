import fs from 'node:fs';
import path from 'node:path';

import { resolveAppPaths } from './ipc/paths.js';

interface ReadingPositionTraceRecord {
  event: string;
  payload: unknown;
  timestamp: number;
}

interface ReadingPositionTraceLoggerOptions {
  appLogDir: string;
  fsModule?: Pick<typeof fs, 'appendFileSync' | 'mkdirSync' | 'writeFileSync'>;
}

export function createReadingPositionTraceLogger(options: ReadingPositionTraceLoggerOptions) {
  const fsModule = options.fsModule ?? fs;
  const filePath = path.join(options.appLogDir, 'reading-position.ndjson');
  fsModule.mkdirSync(options.appLogDir, { recursive: true });
  fsModule.writeFileSync(filePath, '', 'utf8');

  return {
    append(record: ReadingPositionTraceRecord) {
      fsModule.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
      return filePath;
    },
    getFilePath() {
      return filePath;
    }
  };
}

let sharedLogger: ReturnType<typeof createReadingPositionTraceLogger> | null = null;

function getSharedLogger() {
  if (sharedLogger) {
    return sharedLogger;
  }
  sharedLogger = createReadingPositionTraceLogger({
    appLogDir: resolveAppPaths().app_log_dir
  });
  return sharedLogger;
}

export function appendReadingPositionTraceRecord(record: ReadingPositionTraceRecord) {
  return getSharedLogger().append(record);
}

export function getReadingPositionTraceLogPath() {
  return getSharedLogger().getFilePath();
}
