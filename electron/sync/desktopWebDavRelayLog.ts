import { appendFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { shell } from 'electron';

import { resolveAppPaths } from '../ipc/paths.js';

import type { DesktopWebDavRelayHttpStats } from './desktopWebDavRelayHttp.js';

type RoundResult = {
  status: 'completed' | 'failed' | 'cancelled';
  elapsedMs: number;
  published: number;
  applied: number;
  retries: number;
  retryable: boolean;
};

function logPath() {
  return path.join(resolveAppPaths().app_log_dir, 'webdav-sync.txt');
}

async function prepareLogPath() {
  const file = logPath();
  await mkdir(path.dirname(file), { recursive: true });
  return file;
}

export async function openDesktopWebDavRelayLog() {
  if (process.platform !== 'darwin') throw new Error('webdav_log_unavailable');
  const file = logPath();
  try {
    if ((await stat(file)).size === 0) return 'empty' as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'empty' as const;
    throw error;
  }
  if (await shell.openPath(file)) throw new Error('webdav_log_open_failed');
  return null;
}

export async function recordDesktopWebDavRelayLog(operation: 'sync' | 'connection_test',
  stats: DesktopWebDavRelayHttpStats, result: RoundResult) {
  if (process.platform !== 'darwin') return;
  // Only serialize locally generated counters and fixed labels. Network input and errors stay out.
  const { requests, responses, httpStatuses, uploadedBytes, downloadedBytes } = stats;
  const { status, elapsedMs, published, applied, retries, retryable } = result;
  const record = {
    time: new Date().toISOString(), transport: 'WebDAV', operation, status, elapsedMs,
    requests, responses, httpStatuses, uploadedBytes, downloadedBytes, published, applied, retries, retryable
  };
  try {
    await appendFile(await prepareLogPath(), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch {
    console.warn('[webdav] Could not write the local sync log.');
  }
}
