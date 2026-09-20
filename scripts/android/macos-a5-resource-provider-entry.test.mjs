import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { assertResourceProviderOutput, RESOURCE_PROVIDER_TEST, runMacosA5ResourceProviderEntry } from './macos-a5-resource-provider-entry.mjs';

it('registers only the fixed native resource suite behind the mutation lease and frozen candidate', () => {
  expect(assertRegisteredMacosA5Action('resource-provider-contract')).toMatchObject({
    deviceLeaseMode: 'mutation', formalSourceClass: 'frozen-build', formalEvidence: { root: 'a5-resource-provider' }
  });
  for (const output of ['', 'OK (3 tests)', 'FAILURES!!!\nOK (4 tests)']) expect(() => assertResourceProviderOutput(output)).toThrow();
});

it.each([false, true])('checks protected data and restores Activity after instrumentation failure=%s', async (failed) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 't203-entry-'));
  const events = [];
  const args = { assertFixed: vi.fn(), build: vi.fn(), buildIdentity: () => 'run', serial: '87a33a4b', env: {},
    paths: { artifactsRoot: root, deviceBackupRoot: root, buildRoot: root, adb: 'adb', apk: 'main.apk', androidTestApk: 'test.apk' },
    checked: vi.fn((_command, argv) => events.push(argv.join(' '))),
    protectData: vi.fn(async (mode) => events.push(mode)),
    execute: vi.fn(async () => ({ code: 0, output: failed ? 'FAILURES!!!' : 'OK (4 tests)' })) };
  try {
    const run = runMacosA5ResourceProviderEntry(args);
    if (failed) await expect(run).rejects.toThrow('four tests'); else await run;
    expect(args.execute.mock.calls[0][1]).toEqual(['-s', '87a33a4b', 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', RESOURCE_PROVIDER_TEST, 'com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner']);
    expect(events.indexOf('backup')).toBeLessThan(events.indexOf('-s 87a33a4b install -r main.apk'));
    expect(events).toContain('check');
    expect(events.some((event) => event.includes('am start -n com.foliole.android/.MainActivity'))).toBe(true);
    expect(events.some((event) => /pm clear|uninstall com\.foliole\.android$/u.test(event))).toBe(false);
  } finally { rmSync(root, { force: true, recursive: true }); }
});
