import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { dispatchMacosA5Action } from './macos-a5-action-dispatch.mjs';
import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { assertImageContractOutput, IMAGE_TEST_CLASS, runMacosA5ImageContractEntry } from './macos-a5-image-contract-entry.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 's203-command-'));
  roots.push(root);
  const events = [];
  return { events, args: { assertFixed: vi.fn(), pairingReadiness: vi.fn(), readiness: vi.fn(),
    build: vi.fn(), buildIdentity: () => 'run', markMutationBoundary: vi.fn(), serial: '87a33a4b', env: {},
    paths: { artifactsRoot: root, deviceBackupRoot: root, buildRoot: root, adb: 'adb', apk: 'main.apk', androidTestApk: 'test.apk' },
    checked: vi.fn((_command, args) => events.push(args.join(' '))),
    protectData: vi.fn(async (mode) => events.push(mode)),
    execute: vi.fn(async (_command, args) => { events.push(args.join(' ')); return { code: 0, output: 'OK (6 tests)' }; }) } };
}
it('registers the native test behind the existing mutation lease and frozen build contract', () => {
  expect(assertRegisteredMacosA5Action('image-contract')).toMatchObject({ deviceLeaseMode: 'mutation',
    formalSourceClass: 'frozen-build', mutatesFixedA5: true, formalEvidence: { root: 'a5-image-contract' } });
});
it.each(['pairingReadiness', 'readiness'])('does not build or mutate after rejected %s', async (gate) => {
  const { args } = fixture();
  args[gate].mockImplementation(() => { throw new Error('approval_required'); });
  await expect(runMacosA5ImageContractEntry(args)).rejects.toThrow('approval_required');
  expect(args.build).not.toHaveBeenCalled();
  expect(args.checked).not.toHaveBeenCalled();
  expect(args.execute).not.toHaveBeenCalled();
});
it('runs only the fixed class after backup and restores the main Activity', async () => {
  const { args, events } = fixture();
  await dispatchMacosA5Action({ ...args, action: 'image-contract' });
  expect(args.execute.mock.calls[0][1]).toEqual(['-s', '87a33a4b', 'shell', 'am', 'instrument', '-w', '-r',
    '-e', 'class', IMAGE_TEST_CLASS, 'com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner']);
  expect(events.indexOf('backup')).toBeLessThan(events.findIndex((event) => event.includes('install -r main.apk')));
  expect(events).toContain('check');
  expect(events.some((event) => event.includes('am start -n com.foliole.android/.MainActivity'))).toBe(true);
  expect(events.some((event) => /pm clear|uninstall com\.foliole\.android$/u.test(event))).toBe(false);
});
it('retains a test failure while checking protected data and restoring the Activity', async () => {
  const { args, events } = fixture();
  args.execute.mockResolvedValue({ code: 0, output: 'FAILURES!!!' });
  await expect(runMacosA5ImageContractEntry(args)).rejects.toThrow('six tests');
  expect(events).toContain('check');
  expect(events.some((event) => event.includes('am start -n'))).toBe(true);
});
it('rejects partial or failed instrumentation output', () => {
  for (const output of ['OK (3 tests)', '', 'INSTRUMENTATION_FAILED\nOK (6 tests)']) {
    expect(() => assertImageContractOutput(output)).toThrow();
  }
});

it('honors explicit disposable test data without requiring sync credentials or preserving data', async () => {
  const { args } = fixture();
  args.env.FOLIOLE_A5_TEST_DATA_DISPOSABLE = '1';
  args.pairingReadiness.mockImplementation(() => { throw new Error('unsynced data'); });
  await runMacosA5ImageContractEntry(args);
  expect(args.assertFixed).toHaveBeenCalled();
  expect(args.pairingReadiness).not.toHaveBeenCalled();
  expect(args.readiness).not.toHaveBeenCalled();
  expect(args.protectData).not.toHaveBeenCalled();
  expect(args.execute).toHaveBeenCalledTimes(1);
});

it.each(['remove', 'cases-remove-changed', 'cases-offline', 'cases-online'])('rejects %s without explicit disposable data authorization before mutation', async (mode) => {
  const { args } = fixture();
  args.env.FOLIOLE_S203_IMAGE_PROJECTION = mode;
  await expect(runMacosA5ImageContractEntry(args)).rejects.toThrow('disposable');
  expect(args.build).not.toHaveBeenCalled();
  expect(args.checked).not.toHaveBeenCalled();
});

it('passes only the bounded case and observed PID to the native projection', async () => {
  const { args } = fixture();
  args.env.FOLIOLE_A5_TEST_DATA_DISPOSABLE = '1';
  args.env.FOLIOLE_S203_IMAGE_PROJECTION = 'cases-inspect';
  args.env.FOLIOLE_S203_IMAGE_PID = '1234';
  args.execute.mockResolvedValueOnce({ code: 0, output: 'OK (6 tests)' })
    .mockResolvedValueOnce({ code: 0, output: 'OK (1 test)' });
  await runMacosA5ImageContractEntry(args);
  expect(args.execute.mock.calls[1][1]).toEqual(['-s', '87a33a4b', 'shell', 'am', 'instrument', '-w', '-r',
    '-e', 'class', 'com.foliole.android.FolioleArticleImageCasesProjectionTest',
    '-e', 'caseMode', 'inspect', '-e', 'observedPid', '1234', '-e', 'removePublicImage', 'false',
    '-e', 'disposableTestData', 'true', 'com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner']);
});

it('runs the bounded native fixture and preserves its failure while restoring the Activity', async () => {
  const { args, events } = fixture();
  args.env.FOLIOLE_A5_TEST_DATA_DISPOSABLE = '1';
  args.env.FOLIOLE_S203_IMAGE_PROJECTION = 'remove';
  args.execute.mockResolvedValueOnce({ code: 0, output: 'OK (6 tests)' })
    .mockResolvedValueOnce({ code: 0, output: 'FAILURES!!!' });
  await expect(runMacosA5ImageContractEntry(args)).rejects.toThrow('projection failed');
  expect(args.execute.mock.calls[1][1]).toContain('com.foliole.android.FolioleArticleImageProjectionTest');
  expect(events.some((event) => event.includes('am start -n'))).toBe(true);
});
