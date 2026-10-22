import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runMacosA5ImageContractEntry } from './macos-a5-image-contract-entry.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-image-isolation-'));
  roots.push(root);
  const events = [];
  const args = { env: {}, assertFixed: vi.fn(), buildIdentity: () => 'run', serial: '87a33a4b',
    markMutationBoundary: vi.fn(), build: vi.fn(),
    pairingReadiness: () => { throw new Error('daily data must not be inspected'); },
    readiness: vi.fn(),
    paths: { artifactsRoot: root, adb: '/adb', apk: '/main.apk', androidTestApk: '/test.apk' },
    checked: vi.fn((command, argv) => events.push(argv.join(' '))),
    execute: vi.fn(async () => ({ code: 0, output: 'OK (6 tests)' })) };
  const dependencies = { buildIsolated: vi.fn(), cleanupTest: vi.fn() };
  return { args, dependencies, events };
}
it('runs six isolated contracts without accessing the daily application', async () => {
  const { args, dependencies, events } = fixture();
  await runMacosA5ImageContractEntry(args, dependencies);
  expect(args.execute.mock.calls[0][1]).toContain(
    'com.campfirium.foliole.android.acceptance.test/androidx.test.runner.AndroidJUnitRunner');
  expect(args.build).not.toHaveBeenCalled();
  expect(events.some(event => /pm clear|am start|am force-stop/u.test(event))).toBe(false);
  expect(dependencies.cleanupTest).toHaveBeenCalledOnce();
});
it('rejects an APK identity mismatch before installation', async () => {
  const { args, dependencies } = fixture();
  dependencies.buildIsolated.mockImplementation(() => { throw new Error('APK identity mismatch'); });
  await expect(runMacosA5ImageContractEntry(args, dependencies)).rejects.toThrow('APK identity mismatch');
  expect(args.checked).not.toHaveBeenCalled();
  expect(args.execute).not.toHaveBeenCalled();
});
it('cleans the test package and preserves a failed six-test result', async () => {
  const { args, dependencies } = fixture();
  args.execute.mockResolvedValue({ code: 0, output: 'FAILURES!!!' });
  await expect(runMacosA5ImageContractEntry(args, dependencies)).rejects.toThrow('six tests');
  expect(dependencies.cleanupTest).toHaveBeenCalledOnce();
});
