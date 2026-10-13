// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { expect, it, vi } from 'vitest';

import {
  ADVERTISEMENT_REGISTERED_EVENT, captureWindowsSyncRuntimeProgress,
  RECEIVE_OBJECT_COMMITTED_EVENT, waitForWindowsProviderDiscoverable
} from './windows-sync-group-runtime-progress.mjs';

it('observes a split committed-object event and preserves the runtime log', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-runtime-progress-'));
  const logPath = path.join(root, 'runtime.log');
  const child = { stderr: new PassThrough(), stdout: new PassThrough() };
  const progress = captureWindowsSyncRuntimeProgress(child, logPath);
  const midpoint = Math.floor(RECEIVE_OBJECT_COMMITTED_EVENT.length / 2);
  child.stdout.write(RECEIVE_OBJECT_COMMITTED_EVENT.slice(0, midpoint));
  child.stdout.write(`${RECEIVE_OBJECT_COMMITTED_EVENT.slice(midpoint)} globalId=sync-from-zero-a-1\n`);
  await progress.objectCommitted;
  expect(fs.readFileSync(logPath, 'utf8')).toContain('receive dataset object committed');
});

it('preserves multiline failure details after a sync runtime label', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-runtime-progress-'));
  const logPath = path.join(root, 'runtime.log');
  const child = { stderr: new PassThrough(), stdout: new PassThrough() };
  captureWindowsSyncRuntimeProgress(child, logPath);
  child.stdout.write('[sync-group] initial sync waiting for provider {\n');
  child.stdout.write("  error: 'sync_group_sync_pack_failed: fetch failed'\n}\n");
  expect(fs.readFileSync(logPath, 'utf8')).toContain('sync_group_sync_pack_failed: fetch failed');
});

it('waits for the restarted provider advertisement to register', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-runtime-progress-'));
  const child = { stderr: new PassThrough(), stdout: new PassThrough() };
  const progress = captureWindowsSyncRuntimeProgress(child, path.join(root, 'runtime.log'));
  const waiting = waitForWindowsProviderDiscoverable(progress, 1_000);
  const midpoint = Math.floor(ADVERTISEMENT_REGISTERED_EVENT.length / 2);
  child.stderr.write(`[desktop-dnssd] {${ADVERTISEMENT_REGISTERED_EVENT.slice(0, midpoint)}`);
  child.stderr.write(`${ADVERTISEMENT_REGISTERED_EVENT.slice(midpoint)}}\n`);
  await expect(waiting).resolves.toBeUndefined();
});

it('rejects when the restarted provider advertisement never registers', async () => {
  await expect(waitForWindowsProviderDiscoverable({
    advertisementRegistered: new Promise(() => undefined)
  }, 1)).rejects.toThrow('did not become discoverable');
});

it('does not resolve for unrelated sync runtime output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-runtime-progress-'));
  const child = { stderr: new PassThrough(), stdout: new PassThrough() };
  const progress = captureWindowsSyncRuntimeProgress(child, path.join(root, 'runtime.log'));
  const resolved = vi.fn();
  void progress.objectCommitted.then(resolved);
  child.stdout.write('[sync-group] join completed\n');
  await Promise.resolve();
  expect(resolved).not.toHaveBeenCalled();
});
