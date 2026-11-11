import { appendFile, mkdir } from 'node:fs/promises';
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

async function prepareLogPath() {
  const directory = resolveAppPaths().app_log_dir;
  await mkdir(directory, { recursive: true });
  return path.join(directory, 'webdav-sync.txt');
}

export async function openDesktopWebDavRelayLog() {
  if (process.platform !== 'darwin') throw new Error('webdav_log_unavailable');
  const file = await prepareLogPath();
  await appendFile(file, '', { mode: 0o600 });
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
