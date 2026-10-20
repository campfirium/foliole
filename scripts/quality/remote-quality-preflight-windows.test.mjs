// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { runRemoteQuality } from './remote-quality.mjs';
import { parseRemoteQualityArgs } from './remote-quality-args.mjs';
import {
  runWindowsRemoteQualityPreflight, verifyWindowsPreflightReceipt
} from './remote-quality-preflight-windows.mjs';
import { createRunner, SHA } from './remote-quality-test-support.mjs';

const BASE = 'b'.repeat(40);
const TARGET = 'c'.repeat(40);

function receipt(overrides = {}) {
  return { base: BASE, cap: 120, resultStatus: 'passed', selected: ['a.test.mjs', 'b.test.mjs'],
    target: { revision: TARGET, tree: 'd'.repeat(40) }, ...overrides };
}

const verify = (value, expected = ['a.test.mjs', 'b.test.mjs']) => verifyWindowsPreflightReceipt({
  base: BASE, cap: 120, expected, receipt: value, target: TARGET
});

describe('Windows preflight receipt', () => {
  it('accepts a passed receipt for the exact target that covers the selection', () => {
    expect(verify(receipt())).toMatchObject({ resultStatus: 'passed' });
  });

  it('rejects a receipt for another target or base', () => {
    expect(() => verify(receipt({ target: { revision: 'e'.repeat(40) } })))
      .toThrow(`not the dispatch target ${TARGET}`);
    expect(() => verify(receipt({ base: 'f'.repeat(40) }))).toThrow('differs from');
  });

  it('rejects a receipt that does not cover every selected test', () => {
    expect(() => verify(receipt({ selected: ['a.test.mjs'] }), ['a.test.mjs', 'c.test.mjs']))
      .toThrow('does not cover 1 selected test file(s): c.test.mjs');
  });

  it('reports Windows test failures and setup errors as failures', () => {
    expect(() => verify(receipt({ failure: { failedFiles: [{ file: 'a.test.mjs', message: 'boom' }] },
      resultStatus: 'failed' }))).toThrow(/remote preflight failed[\s\S]*a\.test\.mjs: boom/u);
    expect(() => verify(receipt({ failure: { message: 'npm ci exited 1', stage: 'dependencies' },
      resultStatus: 'error' }))).toThrow('could not run (dependencies)');
  });
});

describe('Windows preflight orchestration', () => {
  const plan = vi.fn(async () => ({ changedFiles: ['x.mjs'], deferred: [],
    entries: [{ file: 'a.test.mjs' }], run: [{ file: 'a.test.mjs' }] }));

  it('refuses an unpushed target before planning or touching Windows', async () => {
    const control = vi.fn();
    await expect(runWindowsRemoteQualityPreflight({ base: BASE, control, cwd: '/repo', head: TARGET,
      log: () => {}, plan, verifyPushed: () => { throw new Error('not on pushed origin/dev'); } }))
      .rejects.toThrow('not on pushed origin/dev');
    expect(control).not.toHaveBeenCalled();
  });

  it('runs the registered action for the exact target and verifies its receipt', async () => {
    const control = vi.fn(async () => ({ receipt: receipt({ selected: ['a.test.mjs'] }),
      receiptPath: '/repo/r.json' }));
    await expect(runWindowsRemoteQualityPreflight({ base: BASE, control, cwd: '/repo', head: TARGET,
      log: () => {}, plan, verifyPushed: () => TARGET })).resolves.toMatchObject({ host: 'windows' });
    expect(control).toHaveBeenCalledWith(['remote-preflight', '--revision', TARGET,
      '--preflight-base', BASE]);
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ head: TARGET, host: 'windows', revision: true }));
  });
});

describe('preflight host selection', () => {
  it('accepts only an explicit mac or windows host', () => {
    expect(parseRemoteQualityArgs(['--scope', 'full', '--preflight-host', 'windows']))
      .toMatchObject({ preflightHost: 'windows' });
    expect(() => parseRemoteQualityArgs(['--scope', 'full', '--preflight-host', 'linux']))
      .toThrow('--preflight-host must be');
    expect(() => parseRemoteQualityArgs(['--scope', 'full', '--preflight-host', 'windows',
      '--skip-preflight'])).toThrow('cannot be combined');
  });

  it('uses the Windows preflight only and never falls back to the Mac', async () => {
    const { runner } = createRunner();
    const preflight = vi.fn();
    const windowsPreflight = vi.fn(async () => { throw new Error('Windows unreachable'); });
    await expect(runRemoteQuality({ args: ['--scope', 'desktop', '--preflight-host', 'windows'],
      preflight, runner, windowsPreflight })).rejects.toThrow('Windows unreachable');
    expect(windowsPreflight).toHaveBeenCalledWith(expect.objectContaining({ head: SHA }));
    expect(preflight).not.toHaveBeenCalled();
    expect(runner.mock.calls.some(([, args]) => args.some((arg) => arg.includes('/dispatches'))))
      .toBe(false);
  });

  it('fails when the Windows preflight is requested but unavailable', async () => {
    const { runner } = createRunner();
    await expect(runRemoteQuality({ args: ['--scope', 'desktop', '--preflight-host', 'windows'],
      preflight: vi.fn(), runner })).rejects.toThrow('Windows preflight is not available');
  });
});
