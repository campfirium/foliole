// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  runMacosA5SyncGroupJoinPrepareEntry
} from './macos-a5-sync-group-join-prepare-entry.mjs';

function args() {
  return {
    assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'build-1',
    checked: vi.fn(), env: {}, execute: vi.fn(), markMutationBoundary: vi.fn(),
    paths: { adb: '/adb', apk: '/app.apk', artifactsRoot: '/artifacts',
      buildRoot: '/repo' },
    serial: '87a33a4b'
  };
}

it('binds the fixed A5 action to the inactive native provider and restores the main Activity', async () => {
  const context = args();
  const mechanics = vi.fn(async (input) => {
    input.validateInstrumentation({
      evidencePath: '/artifacts/evidence.json', stdout: 'OK (7 tests)'
    });
    return { evidencePath: '/artifacts/evidence.json', output: '', stdout: 'OK (7 tests)' };
  });

  await expect(runMacosA5SyncGroupJoinPrepareEntry(context, { mechanics }))
    .resolves.toMatchObject({ evidencePath: '/artifacts/evidence.json' });

  expect(mechanics).toHaveBeenCalledWith(expect.objectContaining({
    testClass: 'com.foliole.android.FolioleCompanionJoinRequestProviderTest'
  }));
  expect(context.checked).toHaveBeenCalledWith('/adb', [
    '-s', '87a33a4b', 'shell', 'am', 'start', '-n', 'com.campfirium.foliole.android/com.foliole.android.MainActivity'
  ]);
});

it('rejects instrumentation without the exact native provider success receipt', async () => {
  const context = args();
  const mechanics = async (input) => {
    input.validateInstrumentation({ evidencePath: '/evidence.json', stdout: 'FAILURES!!!' });
  };
  await expect(runMacosA5SyncGroupJoinPrepareEntry(context, { mechanics }))
    .rejects.toThrow('provider test did not pass');
});
