import fs from 'node:fs';
import path from 'node:path';

import { resolveAppPaths } from './ipc/paths.js';

const maxLogBytes = 4 * 1024 * 1024;
const maxRetainedBytes = maxLogBytes / 2;

interface ReadingPositionTraceRecord {
  event: string;
  payload: unknown;
  timestamp: number;
}

function readRecentRecords(filePath: string, size: number, budget: number): Buffer {
  if (budget === 0) return Buffer.alloc(0);
  // Include the preceding byte to detect a record that starts exactly at the cutoff.
  const offset = Math.max(0, size - budget - 1);
  const tail = Buffer.alloc(size - offset);
  const fd = fs.openSync(filePath, 'r');
  try {
    if (fs.readSync(fd, tail, 0, tail.length, offset) !== tail.length) {
      throw new Error('Could not read the complete reading position trace tail');
    }
  } finally {
    fs.closeSync(fd);
  }
  const first = size > budget ? tail.indexOf(0x0a) : -1;
  const last = tail.lastIndexOf(0x0a);
  return tail.subarray(first + 1, last + 1);
}

function replaceTrace(filePath: string, pendingPath: string, size: number, line: Buffer) {
  const recent = readRecentRecords(filePath, size, Math.min(maxRetainedBytes, maxLogBytes - line.length));
  fs.rmSync(pendingPath, { force: true });
  try {
    fs.writeFileSync(pendingPath, Buffer.concat([recent, line]), { flag: 'wx', mode: 0o600 });
    fs.renameSync(pendingPath, filePath);
  } finally {
    fs.rmSync(pendingPath, { force: true });
  }
}

export function createReadingPositionTraceLogger({ appLogDir }: { appLogDir: string }) {
  const filePath = path.join(appLogDir, 'reading-position.ndjson');
  const pendingPath = `${filePath}.tmp`;
  let firstWrite = true;

  return {
    append(record: ReadingPositionTraceRecord) {
      try {
        return appendTrace(record);
      } catch {
        // Tracing is best-effort, including when called from reading-progress persistence.
        return null;
      }
    },
    getFilePath() {
      return filePath;
    }
  };

  function appendTrace(record: ReadingPositionTraceRecord) {
    const line = Buffer.from(`${JSON.stringify(record)}\n`);
    fs.mkdirSync(appLogDir, { recursive: true });
    if (firstWrite) {
      fs.rmSync(pendingPath, { force: true });
      firstWrite = false;
    }
    const existing = fs.lstatSync(filePath, { throwIfNoEntry: false });
    if (existing && !existing.isFile()) return null;
    const size = existing?.size ?? 0;
    if (line.length > maxLogBytes) {
      if (size > maxLogBytes) replaceTrace(filePath, pendingPath, size, Buffer.alloc(0));
      return null;
    }
    if (size + line.length > maxLogBytes) {
      replaceTrace(filePath, pendingPath, size, line);
    } else {
      fs.appendFileSync(filePath, line, { mode: 0o600 });
    }
    return filePath;
  }
}

let sharedLogger: ReturnType<typeof createReadingPositionTraceLogger> | undefined;
let sharedLoggerDir: string | undefined;

export function appendReadingPositionTraceRecord(record: ReadingPositionTraceRecord) {
  try {
    const appLogDir = resolveAppPaths().app_log_dir;
    if (!sharedLogger || sharedLoggerDir !== appLogDir) {
      sharedLogger = createReadingPositionTraceLogger({ appLogDir });
      sharedLoggerDir = appLogDir;
    }
    return sharedLogger.append(record);
  } catch {
    return null;
  }
}
