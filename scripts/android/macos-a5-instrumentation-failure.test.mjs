/* global process */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function fixture({ failed = true, captureFails = false, savedScreen = false } = {}) {
  const parent = path.join(process.cwd(), '.tmp/artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'a5-failure-test-'));
  roots.push(root);
  const appId = 'com.campfirium.foliole.android.acceptance';
  const execute = vi.fn(async (_command, args) => {
    let stdout = 'Success';
    if (args.includes('instrument')) stdout = failed
      ? (savedScreen ? 'INSTRUMENTATION_STATUS: folioleFailurePid=42\n'
        + 'INSTRUMENTATION_STATUS: folioleFailureScreenshot=saved\n' : '')
        + 'INSTRUMENTATION_STATUS_CODE: -2\nstartup error\nINSTRUMENTATION_CODE: -1'
      : 'INSTRUMENTATION_CODE: -1';
    if (args.includes('logcat')) {
      if (captureFails) throw new Error('Device disconnected');
      stdout = '10-12 10:00:00.000 42 42 E Capacitor/Console: WAL startup failed\n'
        + '10-12 10:00:00.001 99 99 I PrivateApp: unrelated data';
    }
    if (args.includes('pidof')) stdout = '42';
    if (args.includes('dumpsys')) stdout = `mResumedActivity: ${appId}/com.foliole.android.MainActivity`;
    if (args.includes('pull')) fs.writeFileSync(args.at(-1), 'test screenshot');
    return { code: 0, stdout, output: stdout };
  });
  return { root, execute, args: { appId, buildIdentity: 'test', env: {}, evidenceRoot: root,
    execute, installMain: false, serial: '87a33a4b', testClass: 'com.foliole.android.Test',
    paths: { adb: '/fixed/adb', buildRoot: process.cwd() } } };
}

it('saves failure evidence before cleanup and excludes unrelated app logs', async () => {
  const { args, root, execute } = fixture();
  await expect(runMacosA5InstrumentationMechanics(args)).rejects.toMatchObject({
    missingFact: 'android_instrumentation_test_success'
  });
  const evidence = path.join(root, 'instrumentation-failure');
  expect(fs.readFileSync(path.join(evidence, 'failure.txt'), 'utf8')).toContain('startup error');
  expect(fs.readFileSync(path.join(evidence, 'console.txt'), 'utf8')).toContain('WAL startup failed');
  expect(fs.readFileSync(path.join(evidence, 'logcat-tail.txt'), 'utf8')).not.toContain('unrelated data');
  expect(fs.existsSync(path.join(evidence, 'screen.png'))).toBe(true);
  const calls = execute.mock.calls.map(([, command]) => command.join(' '));
  expect(calls.findIndex((command) => command.includes(' logcat ')))
    .toBeLessThan(calls.findIndex((command) => command.includes(' uninstall ')));
});

it('preserves the original failure when log capture fails', async () => {
  const { args, root } = fixture({ captureFails: true });
  await expect(runMacosA5InstrumentationMechanics(args)).rejects.toMatchObject({
    missingFact: 'android_instrumentation_test_success'
  });
  expect(fs.readFileSync(path.join(root, 'instrumentation-failure/capture-errors.json'), 'utf8'))
    .toContain('Device disconnected');
});

it('does not collect diagnostics on success or from the main application', async () => {
  for (const failed of [false, true]) {
    const { args, execute } = fixture({ failed });
    if (failed) args.appId = 'com.campfirium.foliole.android';
    await runMacosA5InstrumentationMechanics({ ...args, instrumentationOwnsActivity: true })
      .catch(() => {});
    expect(execute.mock.calls.some(([, command]) => command.includes('logcat'))).toBe(false);
  }
});

it('collects the screenshot saved before Activity teardown and logs from its reported process', async () => {
  const { args, execute, root } = fixture({ savedScreen: true });
  await expect(runMacosA5InstrumentationMechanics(args)).rejects.toMatchObject({
    missingFact: 'android_instrumentation_test_success'
  });
  expect(execute.mock.calls.some(([, command]) => command.includes('--pid=42'))).toBe(true);
  expect(execute.mock.calls.some(([, command]) => command.includes('screencap'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'instrumentation-failure/screen.png'))).toBe(true);
});

it('retains the crash stack after the acceptance process has exited', async () => {
  const { args, root, execute } = fixture();
  const original = execute.getMockImplementation();
  execute.mockImplementation(async (command, commandArgs) => {
    if (commandArgs.includes('crash')) return { code: 0, stdout:
      '10-26 10:00:00.000 77 77 E AndroidRuntime: Process: com.campfirium.foliole.android.acceptance, PID: 77\n'
      + '10-26 10:00:00.001 77 77 E AndroidRuntime: java.lang.IllegalStateException: startup failed\n'
      + '10-26 10:00:00.002 88 88 E AndroidRuntime: unrelated crash' };
    if (commandArgs.includes('pidof')) return { code: 1, stderr: 'Process exited' };
    return original(command, commandArgs);
  });
  await runMacosA5InstrumentationMechanics(args).catch(() => {});
  const log = fs.readFileSync(path.join(root, 'instrumentation-failure/logcat-tail.txt'), 'utf8');
  expect(log).toContain('IllegalStateException: startup failed');
  expect(log).not.toContain('unrelated crash');
});
