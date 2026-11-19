import fs from 'node:fs';
import path from 'node:path';

const maxLogBytes = 4 * 1024 * 1024;
const maxRetainedBytes = maxLogBytes / 2;

export function isDesktopDebugProbeEnabled() {
  return process.env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE === '1' || Boolean(process.env.ELECTRON_RENDERER_URL);
}

function readRecentRecords(filePath: string, size: number, budget: number): Buffer {
  if (budget === 0) return Buffer.alloc(0);
  // Include the preceding byte to detect a record that starts exactly at the cutoff.
  const offset = Math.max(0, size - budget - 1);
  const tail = Buffer.alloc(size - offset);
  const fd = fs.openSync(filePath, 'r');
  try {
    if (fs.readSync(fd, tail, 0, tail.length, offset) !== tail.length) {
      throw new Error('Could not read the complete diagnostic trace tail');
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

export function createDesktopDebugTraceAppender(resolveFilePath: () => string) {
  let lastFilePath: string | undefined;
  return (record: unknown) => {
    try {
      return appendTrace(record, resolveFilePath());
    } catch {
      return null;
    }
  };

  function appendTrace(record: unknown, filePath: string) {
    const pendingPath = `${filePath}.tmp`;
    const line = Buffer.from(`${JSON.stringify(record)}\n`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (lastFilePath !== filePath) {
      fs.rmSync(pendingPath, { force: true });
      lastFilePath = filePath;
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
