// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';
import { syncGroupInteractivePaths } from './windows-sync-group-interactive-state.mjs';

const roots = [];

afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-group-provider-release-'));
  roots.push(repoRoot);
  const releasePath = syncGroupInteractivePaths(repoRoot).providerRelease;
  fs.mkdirSync(path.dirname(releasePath), { recursive: true });
  return { releasePath, repoRoot };
}

it('keeps the provider alive until the matching consumer completion event', async () => {
  const { releasePath, repoRoot } = fixture();
  const waiting = waitForWindowsSyncGroupProviderRelease({
    action: 'multi-device-sync-a-rejoin', repoRoot, timeoutMs: 1_000
  });
  fs.writeFileSync(releasePath, `${JSON.stringify({
    action: 'multi-device-sync-a-rejoin', schemaVersion: 1, status: 'consumer_complete'
  })}\n`, 'utf8');
  await expect(waiting).resolves.toMatchObject({ status: 'consumer_complete' });
  expect(fs.existsSync(releasePath)).toBe(false);
});

it('fails closed when the controller cancels the provider lifecycle', async () => {
  const { releasePath, repoRoot } = fixture();
  const waiting = waitForWindowsSyncGroupProviderRelease({
    action: 'multi-device-sync-a-rejoin', repoRoot, timeoutMs: 1_000
  });
  fs.writeFileSync(releasePath, `${JSON.stringify({
    action: 'multi-device-sync-a-rejoin', schemaVersion: 1, status: 'cancelled'
  })}\n`, 'utf8');
  await expect(waiting).rejects.toThrow('cancelled');
});
