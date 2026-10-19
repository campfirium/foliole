import { expect, it, vi } from 'vitest';

import { runMacosA5SyncNowEntry } from './macos-a5-sync-now-entry.mjs';

function fixture() {
  const runAction = vi.fn(async () => ({ manifestPath: '/evidence/manifest.json', output: '' }));
  const assertDailyRuntime = vi.fn(async () => ({ pid: 42 }));
  const inspectBaseline = vi.fn(async () => ({ resultStatus: 'approval_required', differences: [{}] }));
  const openDesktopSession = vi.fn(async () => ({ assertActive() {}, enable() {}, close() {} }));
  const args = {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-1',
    checked: vi.fn(), env: {}, execute: vi.fn(), markMutationBoundary: vi.fn(),
    paths: { artifactsRoot: '/artifacts', buildRoot: '/repo', sourceRepoRoot: '/repo',
      adb: '/adb', desktopDevLibrary: '/unrelated-library', desktopRuntimeRoot: '/runtime' },
    serial: '87a33a4b'
  };
  return { args, dependencies: { assertDailyRuntime, inspectBaseline, runAction,
    buildDesktop: vi.fn(), openDesktopSession } };
}

it('uses the existing daily runtime without creating a group or USB transport', async () => {
  const { args, dependencies } = fixture();
  await runMacosA5SyncNowEntry(args, dependencies);
  expect(dependencies.openDesktopSession).not.toHaveBeenCalled();
  expect(dependencies.inspectBaseline).toHaveBeenCalledWith(expect.objectContaining({
    desktopDatabase: '/Users/roamer/Documents/Foliole/Data/foliole.db'
  }));
  expect(dependencies.runAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'sync-now', transportRequired: false, instrumentationOwnsActivity: true
  }));
});

it('refuses a wrong desktop listener before building or mutating the phone', async () => {
  const { args, dependencies } = fixture();
  dependencies.assertDailyRuntime.mockRejectedValue(new Error('daily_sync_listener_mismatch'));
  await expect(runMacosA5SyncNowEntry(args, dependencies)).rejects.toThrow('daily_sync_listener_mismatch');
  expect(args.build).not.toHaveBeenCalled();
  expect(args.markMutationBoundary).not.toHaveBeenCalled();
  expect(dependencies.runAction).not.toHaveBeenCalled();
});

it('refuses an unrelated phone group before building or syncing', async () => {
  const { args, dependencies } = fixture();
  dependencies.inspectBaseline.mockRejectedValue(new Error('existing_sync_group_mismatch'));
  await expect(runMacosA5SyncNowEntry(args, dependencies)).rejects.toThrow('existing_sync_group_mismatch');
  expect(args.build).not.toHaveBeenCalled();
  expect(dependencies.runAction).not.toHaveBeenCalled();
});
