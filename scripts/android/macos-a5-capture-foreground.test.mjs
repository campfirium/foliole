import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./macos-a5-process.mjs', () => ({
  checked: vi.fn(), captured: vi.fn(), execute: vi.fn()
}));
vi.mock('./macos-a5-readiness.mjs', () => ({
  createMacosA5CaptureIdentity: vi.fn(), runMacosA5CaptureReadiness: vi.fn(),
  runMacosA5PairingReadiness: vi.fn()
}));
vi.mock('./android-a5-capture-annotation-action.mjs', () => ({ runA5CaptureAnnotation: vi.fn() }));

import { captureAnnotation } from './macos-a5-dev.mjs';
import { checked, captured } from './macos-a5-process.mjs';
import { runA5CaptureAnnotation } from './android-a5-capture-annotation-action.mjs';

const paths = { adb: '/adb', buildRoot: '/candidate', artifactsRoot: '/evidence' };
const run = () => captureAnnotation(paths, () => 'run', () => {}, () => {});
const restored = () => checked.mock.calls.some(([, args]) => args.includes('am') && args.includes('start'));

beforeEach(() => {
  vi.resetAllMocks();
  captured.mockImplementation((command, args) => args.includes('get-state') ? 'device' : '87a33a4b\tdevice');
  runA5CaptureAnnotation.mockResolvedValue({ output: '', captureAnnotation: { manifestPath: '/manifest' } });
});

it('restores and verifies the main Activity after successful capture', async () => {
  await run();
  expect(restored()).toBe(true);
  expect(checked.mock.calls.at(-1)[1]).toContain('/candidate/scripts/android/verify-android-launch.mjs');
});

it.each(['instrumentation', 'capture-database-audit', 'capture-cleanup'])(
  'restores the Activity after %s failure without replacing the error', async (stage) => {
    const failure = Object.assign(new Error(stage), { stage });
    runA5CaptureAnnotation.mockRejectedValue(failure);
    await expect(run()).rejects.toBe(failure);
    expect(restored()).toBe(true);
  }
);

it('rejects an otherwise successful capture when foreground verification fails', async () => {
  checked.mockImplementation((command, args) => {
    if (args.some((arg) => arg.endsWith('verify-android-launch.mjs'))) throw new Error('not foreground');
  });
  await expect(run()).rejects.toThrow('not foreground');
});

it('retains both the action error and a failed foreground restoration', async () => {
  const primary = new Error('audit failed');
  const cleanup = new Error('restore failed');
  runA5CaptureAnnotation.mockRejectedValue(primary);
  checked.mockImplementation((command, args) => {
    if (args.includes('am') && args.includes('start')) throw cleanup;
  });
  await expect(run()).rejects.toBe(primary);
  expect(primary.foregroundRestoreError).toBe(cleanup);
});
