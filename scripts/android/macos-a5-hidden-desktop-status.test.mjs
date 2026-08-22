// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5HiddenDesktopStatusEntry } from './macos-a5-hidden-desktop-status.mjs';

let root;

afterEach(() => {
  if (root) fs.rmSync(root, { force: true, recursive: true });
  root = undefined;
});

it('writes a redacted hidden desktop status without touching the fixed A5', async () => {
  root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-hidden-status-'));
  const close = vi.fn(async () => undefined);
  const result = await runMacosA5HiddenDesktopStatusEntry({
    build: vi.fn(), buildIdentity: () => 'run-1', checked: vi.fn(), env: { BASE: 'kept' },
    paths: { artifactsRoot: root, buildRoot: '/capsule', desktopDevLibrary: '/library',
      desktopRuntimeRoot: '/runtime' }
  }, {
    buildDesktop: vi.fn(),
    openSession: vi.fn(async () => ({ close, load: async () => ({
      sync_group: { members: [{ state: 'active' }, { state: 'departed' }] }
    }), sanitize: () => ({ pairedAuthorizationFingerprints: ['private'],
      serverState: 'running', syncEnabled: true }) }))
  });
  expect(result.evidence).toEqual({ activeMemberCount: 1, pairedAuthorizationCount: 1,
    resultStatus: 'success', runId: 'run-1', schemaVersion: 1,
    serverState: 'running', syncEnabled: true });
  expect(fs.readFileSync(result.evidencePath, 'utf8')).not.toContain('private');
  expect(close).toHaveBeenCalledOnce();
});

it('closes the hidden session when the Sync Group is absent', async () => {
  const close = vi.fn(async () => undefined);
  await expect(runMacosA5HiddenDesktopStatusEntry({
    build: vi.fn(), buildIdentity: () => 'run-2', checked: vi.fn(), env: {},
    paths: { artifactsRoot: '/evidence', buildRoot: '/capsule',
      desktopDevLibrary: '/library', desktopRuntimeRoot: '/runtime' }
  }, { buildDesktop: vi.fn(), openSession: async () => ({ close,
    load: async () => ({ sync_group: null }) }) })).rejects.toThrow('unavailable');
  expect(close).toHaveBeenCalledOnce();
});
