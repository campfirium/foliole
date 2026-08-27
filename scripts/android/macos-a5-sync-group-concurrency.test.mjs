/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';

it('aborts host observation when physical A5 instrumentation fails first', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'artifacts', 'a5-race-'));
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0, output: 'INSTRUMENTATION_CODE: -1', stdout: 'INSTRUMENTATION_CODE: -1'
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  const observer = vi.fn(({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  try {
    await expect(runMacosA5InstrumentationMechanics({
      appId: 'com.foliole.android.acceptance', buildIdentity: 'race', env: {}, evidenceRoot,
      execute, observeConcurrently: true, observeWhileTransportOpen: observer,
      paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() },
      serial: '87a33a4b', testClass: 'com.foliole.android.PhysicalTest',
      validateInstrumentation: () => { throw new Error('physical stage failed'); }
    })).rejects.toThrow('physical stage failed');
    expect(observer).toHaveBeenCalledOnce();
    expect(observer.mock.calls[0][0].signal.aborted).toBe(true);
  } finally {
    fs.rmSync(evidenceRoot, { force: true, recursive: true });
  }
});
