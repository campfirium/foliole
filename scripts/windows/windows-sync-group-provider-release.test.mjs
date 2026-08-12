// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';
import {
  syncGroupInteractivePaths, writeJsonAtomic
} from './windows-sync-group-interactive-state.mjs';

const roots = [];

afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-group-provider-release-'));
  roots.push(repoRoot);
  const paths = syncGroupInteractivePaths(repoRoot);
  const releasePath = paths.providerRelease;
  fs.mkdirSync(path.dirname(releasePath), { recursive: true });
  const nonce = '00000000-0000-4000-8000-000000000001';
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/windows-dev-action/run-1');
  fs.writeFileSync(paths.request, JSON.stringify({
    action: 'multi-device-sync-a-rejoin', evidenceRoot, nonce, schemaVersion: 1
  }));
  return { nonce, releasePath, repoRoot };
}

function watchFixture() {
  let listener = null;
  return {
    notify(fileName) {
      if (!listener) throw new Error('provider release watcher is not ready');
      listener('rename', fileName);
    },
    watchDirectory: vi.fn((_directory, nextListener) => {
      listener = nextListener;
      return { close: vi.fn() };
    })
  };
}

it('keeps the provider alive until the matching consumer completion event', async () => {
  const { nonce, releasePath, repoRoot } = fixture();
  const waiting = waitForWindowsSyncGroupProviderRelease({
    action: 'multi-device-sync-a-rejoin', repoRoot, timeoutMs: 1_000
  });
  writeJsonAtomic(releasePath, {
    action: 'multi-device-sync-a-rejoin', nonce, schemaVersion: 1, status: 'consumer_complete'
  });
  await expect(waiting).resolves.toMatchObject({ status: 'consumer_complete' });
  expect(fs.existsSync(releasePath)).toBe(false);
});

it('fails closed when the controller cancels the provider lifecycle', async () => {
  const { nonce, releasePath, repoRoot } = fixture();
  const waiting = waitForWindowsSyncGroupProviderRelease({
    action: 'multi-device-sync-a-rejoin', repoRoot, timeoutMs: 1_000
  });
  writeJsonAtomic(releasePath, {
    action: 'multi-device-sync-a-rejoin', nonce, schemaVersion: 1, status: 'cancelled'
  });
  await expect(waiting).rejects.toThrow('cancelled');
});

it('rechecks the nonce-bound release after any directory notification', async () => {
  const { nonce, releasePath, repoRoot } = fixture();
  const watcher = watchFixture();
  const waiting = waitForWindowsSyncGroupProviderRelease({
    action: 'multi-device-sync-a-rejoin', repoRoot, timeoutMs: 1_000,
    watchDirectory: watcher.watchDirectory
  });
  fs.writeFileSync(releasePath, `${JSON.stringify({
    action: 'multi-device-sync-a-rejoin', nonce, schemaVersion: 1, status: 'consumer_complete'
  })}\n`, 'utf8');
  watcher.notify('provider-release.json.pending');

  await expect(waiting).resolves.toMatchObject({ status: 'consumer_complete' });
  expect(watcher.watchDirectory).toHaveBeenCalledOnce();
});

it('rejects a release from a stale provider request', async () => {
  const { releasePath, repoRoot } = fixture();
  fs.writeFileSync(releasePath, `${JSON.stringify({
    action: 'multi-device-sync-a-rejoin', nonce: '00000000-0000-4000-8000-000000000099',
    schemaVersion: 1, status: 'consumer_complete'
  })}\n`, 'utf8');
  const waiting = waitForWindowsSyncGroupProviderRelease({
    action: 'multi-device-sync-a-rejoin', repoRoot, timeoutMs: 1_000
  });
  await expect(waiting).rejects.toThrow('invalid Sync Group provider release');
});
