import { expect, it, vi } from 'vitest';

vi.mock('./macos-a5-build-capsule.mjs', () => ({ closeMacosA5BuildCapsule: vi.fn() }));
vi.mock('./macos-a5-execution-context.mjs', () => ({ closeMacosA5Run: vi.fn() }));

import { cleanupMacosA5Run } from './macos-a5-run-cleanup.mjs';

function cleanupWithScrcpyStatus(status, deviceLeaseMode = 'readonly-lifecycle') {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, args]);
    return { status };
  };
  const error = cleanupMacosA5Run({
    actionFailed: false, adb: '/adb', context: {}, deviceLeaseMode,
    lease: null, receipt: null, spawn
  });
  return { calls, error };
}

it('keeps the shared adb server while scrcpy is running', () => {
  const { calls, error } = cleanupWithScrcpyStatus(0);
  expect(error).toBeNull();
  expect(calls).toEqual([['/usr/bin/pgrep', ['-x', 'scrcpy']]]);
});

it('stops adb when no scrcpy process is using it', () => {
  const { calls, error } = cleanupWithScrcpyStatus(1);
  expect(error).toBeNull();
  expect(calls).toEqual([
    ['/usr/bin/pgrep', ['-x', 'scrcpy']],
    ['/adb', ['kill-server']]
  ]);
});

it('does not inspect adb for actions without a device lease', () => {
  const { calls, error } = cleanupWithScrcpyStatus(0, null);
  expect(error).toBeNull();
  expect(calls).toEqual([]);
});
