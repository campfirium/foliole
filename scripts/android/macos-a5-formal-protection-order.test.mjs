// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ events: [], failStop: false, backupCode: 0 }));
vi.mock('./macos-a5-process.mjs', () => ({
  checked: vi.fn((_command, args) => {
    if (!args.includes('force-stop')) return;
    state.events.push('stop');
    expect(args).toEqual(['-s', '87a33a4b', 'shell', 'am', 'force-stop', 'com.foliole.android']);
    if (state.failStop) throw new Error('stop failed');
  }),
  captured: vi.fn((_command, args) => args.includes('devices') ? '87a33a4b\tdevice' : 'device'),
  execute: vi.fn(async (_command, args) => {
    expect(args).toContain('--mode');
    expect(args).toContain('backup');
    state.events.push('backup');
    return { code: state.backupCode };
  })
}));
vi.mock('./macos-a5-formal-lifecycle.mjs', () => ({
  openMacosA5Lifecycle: ({ formal }) => ({
    context: { runId: 'test-run', deviceBackupRoot: '/backup' },
    receipt: formal ? { path: '/evidence/receipt.json', receipt: {} } : null,
    sharedCacheRoot: '/cache'
  }),
  finishMacosA5Lifecycle: ({ failure }) => { if (failure) throw failure; }
}));
vi.mock('./macos-a5-build-capsule.mjs', () => ({ openMacosA5BuildCapsule: (context) => context }));
vi.mock('./macos-a5-runtime-paths.mjs', () => ({
  assertSafeMacosA5Environment: vi.fn(),
  macosA5GradleEnv: (env) => env,
  macosA5Paths: (context) => ({ ...context, adb: '/adb', buildRoot: '/repo' })
}));
vi.mock('./macos-a5-run-lease.mjs', () => ({
  acquireMacosA5DeviceLease: () => { state.events.push('lease'); return {}; }
}));
vi.mock('./macos-a5-run-cleanup.mjs', () => ({
  cleanupMacosA5Run: () => { state.events.push('cleanup'); return null; }
}));
vi.mock('./macos-a5-formal-receipt.mjs', () => ({
  captureFormalA5Toolchain: vi.fn(),
  formalA5FailureStage: (_error, stage) => stage,
  markFormalA5Stage: vi.fn(),
  markFormalA5ActionRunning: vi.fn(),
  markFormalA5MutationBoundary: vi.fn(),
  prepareFormalA5ReceiptCompletion: vi.fn(),
  recordFormalA5DataProtection: () => state.events.push('backup-validated'),
  recordFormalA5Lease: vi.fn()
}));
vi.mock('./macos-a5-action-dispatch.mjs', () => ({
  dispatchMacosA5Action: () => state.events.push('dispatch'),
  macosA5ErrorEvidence: vi.fn()
}));

import { runMacosA5Action } from './macos-a5-dev.mjs';

beforeEach(() => {
  state.events = [];
  state.failStop = false;
  state.backupCode = 0;
});

it('dispatches formal deploy without a pre-install backup', async () => {
  await runMacosA5Action('deploy', '/repo', { formal: true });
  expect(state.events).toEqual(['lease', 'dispatch', 'cleanup']);
});

it('still protects other fixed-device mutations before dispatch', async () => {
  await runMacosA5Action('device-profile', '/repo', { formal: true });
  expect(state.events).toEqual(['lease', 'stop', 'backup', 'backup-validated', 'dispatch', 'cleanup']);
});

it('does not back up or dispatch device changes when stopping the writer fails', async () => {
  state.failStop = true;
  await expect(runMacosA5Action('device-profile', '/repo', { formal: true })).rejects.toThrow('stop failed');
  expect(state.events).toEqual(['lease', 'stop', 'cleanup']);
});

it('does not install or dispatch device changes when the protected backup fails', async () => {
  state.backupCode = 1;
  await expect(runMacosA5Action('device-profile', '/repo', { formal: true }))
    .rejects.toThrow('Data protection backup failed');
  expect(state.events).toEqual(['lease', 'stop', 'backup', 'cleanup']);
});

it('does not stop the app for a formal build that never touches the device', async () => {
  await runMacosA5Action('build', '/repo', { formal: true });
  expect(state.events).toEqual(['dispatch', 'cleanup']);
});

it('leaves ordinary deployment protection with its existing action owner', async () => {
  await runMacosA5Action('deploy', '/repo');
  expect(state.events).toEqual(['lease', 'dispatch', 'cleanup']);
});
