// @vitest-environment node

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const { resolveAppPaths, openPath } = vi.hoisted(() => ({
  resolveAppPaths: vi.fn(), openPath: vi.fn().mockResolvedValue('')
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths }));
vi.mock('electron', () => ({ shell: { openPath } }));

import { openDesktopWebDavRelayLog, recordDesktopWebDavRelayLog } from './desktopWebDavRelayLog.js';

afterEach(() => vi.unstubAllGlobals());

it('keeps the latest overlapping rounds readable in an existing oversized WebDAV log', async () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin' });
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-webdav-log-'));
  resolveAppPaths.mockReturnValue({ app_log_dir: root });
  const logFile = path.join(root, 'webdav-sync.txt');
  const stats = { requests: { GET: 1 }, responses: 1, uploadedBytes: 0, downloadedBytes: 8 };
  const result = { status: 'completed' as const, elapsedMs: 7, published: 0, applied: 1, retries: 0, retryable: false };
  try {
    const older = JSON.stringify({ operation: 'sync', duration: 'x'.repeat(8000) });
    await writeFile(logFile, `${older}\n`.repeat(140) + '{"operation":"older-recent"}\n');
    await Promise.all([
      recordDesktopWebDavRelayLog('sync', stats, result),
      recordDesktopWebDavRelayLog('connection_test', stats, result)
    ]);

    expect((await stat(logFile)).size).toBeLessThanOrEqual(1024 * 1024);
    const text = await readFile(logFile, 'utf8');
    const records = text.trimEnd().split('\n').map(line => JSON.parse(line));
    expect(records.slice(-3).map(record => record.operation)).toEqual(['older-recent', 'sync', 'connection_test']);
    await expect(openDesktopWebDavRelayLog()).resolves.toBeNull();
    expect(openPath).toHaveBeenCalledWith(logFile);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
