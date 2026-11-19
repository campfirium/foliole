import fs from 'node:fs/promises';
import path from 'node:path';

import { isDesktopDebugProbeEnabled } from './desktopDebugTrace.js';

const readingLogs = new Set(['reading-position.ndjson', 'reading-position.ndjson.tmp']);
const windowLogs = new Set(['window-state-lifecycle.ndjson', 'renderer-state.ndjson', 'renderer-state.ndjson.tmp']);
const importLogName = /^import-\d{4}-\d{2}-\d{2}\.log$/u;

async function removeRetiredFiles(directory: string, isRetired: (name: string) => boolean) {
  try {
    if (!(await fs.lstat(directory)).isDirectory()) return;
    const files = await fs.readdir(directory, { withFileTypes: true });
    const results = await Promise.allSettled(files
      .filter(file => file.isFile() && isRetired(file.name))
      .map(file => fs.rm(path.join(directory, file.name), { force: true })));
    if (results.some(result => result.status === 'rejected')) {
      console.warn('[diagnostics] Could not remove a retired desktop log');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[diagnostics] Could not read a retired desktop log directory');
    }
  }
}

export async function removeRetiredDesktopLogs(logDirectory: string) {
  if (isDesktopDebugProbeEnabled()) return;
  try {
    if (!(await fs.lstat(logDirectory)).isDirectory()) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[diagnostics] Could not read the desktop log directory');
    }
    return;
  }
  await Promise.all([
    removeRetiredFiles(logDirectory, name => readingLogs.has(name)),
    removeRetiredFiles(path.join(logDirectory, 'windows'), name => windowLogs.has(name)),
    removeRetiredFiles(path.join(logDirectory, 'import'), name => importLogName.test(name))
  ]);
}
