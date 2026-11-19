import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

import { isDesktopDebugProbeEnabled } from './desktopDebugTrace.js';
import { maintainRuntimeDiagnosticLogs } from './diagnosticLog.js';

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

async function removeRetiredDesktopLogs(logDirectory: string) {
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

export async function maintainDesktopLogsOnStartup() {
  try {
    const { app_log_dir: logDir } = resolveAppPaths();
    await Promise.all([removeRetiredDesktopLogs(logDir), maintainRuntimeDiagnosticLogs(logDir)]);
  } catch {
    console.warn('[diagnostics] Could not apply runtime log retention');
  }
}
