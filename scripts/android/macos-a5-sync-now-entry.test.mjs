import { expect, it, vi } from 'vitest';

import { runMacosA5SyncNowEntry } from './macos-a5-sync-now-entry.mjs';

it('runs one public Sync Now action and consumes only its mechanical lifecycle result', async () => {
  const close = vi.fn(async () => undefined);
  const assertActive = vi.fn();
  const openDesktopSession = vi.fn(async () => ({ assertActive, close }));
  const runAction = vi.fn(async () => ({
    manifestPath: '/artifacts/a5-sync-now/build-1/sync-group-maintenance-manifest.json',
    output: ''
  }));
  const markMutationBoundary = vi.fn();
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-1',
    checked: vi.fn(), env: {}, execute: vi.fn(), markMutationBoundary,
    paths: {
      artifactsRoot: '/artifacts', buildRoot: '/repo', desktopDevLibrary: '/library',
      desktopRuntimeRoot: '/runtime'
    }, serial: '87a33a4b'
  };

  await expect(runMacosA5SyncNowEntry(args, {
    buildDesktop: vi.fn(), openDesktopSession, runAction
  })).resolves.toMatchObject({ manifestPath: expect.stringContaining('sync-group-maintenance') });

  expect(markMutationBoundary).toHaveBeenCalledOnce();
  expect(assertActive).toHaveBeenCalledOnce();
  expect(runAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'sync-now', buildIdentity: 'build-1', serial: '87a33a4b'
  }));
  expect(runAction.mock.calls[0][0]).not.toHaveProperty('observeWhileTransportOpen');
  expect(close).toHaveBeenCalledOnce();
});

it('closes the desktop runtime when the public action fails', async () => {
  const close = vi.fn(async () => undefined);
  await expect(runMacosA5SyncNowEntry({
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-2',
    checked: vi.fn(), env: {}, execute: vi.fn(), paths: {
      artifactsRoot: '/artifacts', buildRoot: '/repo', desktopDevLibrary: '/library',
      desktopRuntimeRoot: '/runtime'
    }, serial: '87a33a4b'
  }, {
    buildDesktop: vi.fn(),
    openDesktopSession: async () => ({ assertActive: vi.fn(), close }),
    runAction: async () => { throw new Error('action lifecycle missing'); }
  })).rejects.toThrow('action lifecycle missing');
  expect(close).toHaveBeenCalledOnce();
});
