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

interface ReadingPositionTraceLogger {
  append(record: ReadingPositionTraceRecord): string | null;
  getFilePath(): string | null;
}

function ensureTraceFile(filePath: string, fsModule: Pick<typeof fs, 'appendFileSync' | 'mkdirSync' | 'writeFileSync'>) {
  fsModule.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fsModule.writeFileSync(filePath, '', 'utf8');
  }
}

export function createReadingPositionTraceLogger(options: ReadingPositionTraceLoggerOptions) {
  const fsModule = options.fsModule ?? fs;
  const filePath = path.join(options.appLogDir, 'reading-position.ndjson');
  ensureTraceFile(filePath, fsModule);

  return {
    append(record: ReadingPositionTraceRecord) {
      ensureTraceFile(filePath, fsModule);
      fsModule.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
      return filePath;
    },
    getFilePath() {
      return filePath;
    }
  };
}

let sharedLogger: ReadingPositionTraceLogger | null = null;
let sharedLoggerDir: string | null = null;

function createNoopLogger(): ReadingPositionTraceLogger {
  return {
    append() {
      return null;
    },
    getFilePath() {
      return null;
    }
  };
}

function getSharedLogger(): ReadingPositionTraceLogger {
  let appLogDir: string;
  try {
    appLogDir = resolveAppPaths().app_log_dir;
  } catch {
    sharedLogger = createNoopLogger();
    sharedLoggerDir = null;
    return sharedLogger;
  }

  if (sharedLogger && sharedLoggerDir === appLogDir) {
    return sharedLogger;
  }

  sharedLogger = createReadingPositionTraceLogger({ appLogDir });
  sharedLoggerDir = appLogDir;
  return sharedLogger;
}

export function appendReadingPositionTraceRecord(record: ReadingPositionTraceRecord) {
  return getSharedLogger().append(record);
}
