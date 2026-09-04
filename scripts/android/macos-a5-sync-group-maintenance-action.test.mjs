/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createTestRoot() {
  const parent = path.join(process.cwd(), '.tmp', 'artifacts');
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, 'a5-maintenance-test-'));
}

function successfulAdbResult(args) {
  const output = args.includes('dumpsys')
    ? 'topResumedActivity=com.foliole.android/com.foliole.android.MainActivity'
    : 'Success\n';
  return { code: 0, output, stdout: output };
}

it('uses the fixed product instrumentation method and records its receipt', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('instrument')) return {
      code: 0,
      output: 'instrumentation',
      stdout: [
        'INSTRUMENTATION_STATUS: folioleActionReceipt={"ok":true,"departurePersisted":true}',
        'INSTRUMENTATION_STATUS: folioleAfterSemantic={"location":"/"}',
        'INSTRUMENTATION_CODE: -1'
      ].join('\n')
    };
    return successfulAdbResult(args);
  });
  const result = await runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'build-1', env: {}, evidenceRoot: root, execute,
    observeWhileTransportOpen: vi.fn(async () => ({ exactFact: 'fact-a' })),
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  });
  expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))).toMatchObject({
    action: 'leave-sync-group', receipt: { departurePersisted: true }, serial: '87a33a4b'
  });
  expect(result.observation).toEqual({ exactFact: 'fact-a' });
  expect(execute.mock.calls.some(([, args]) => args.includes(
    'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest#leavesSyncGroupThroughProduct'
  ))).toBe(true);
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse tcp:38641 tcp:38641')).toBe(true);
  const reverseCalls = execute.mock.calls.map(([, args]) => args.join(' '))
    .filter((args) => args.includes(' reverse '));
  expect(reverseCalls).toEqual([
    '-s 87a33a4b reverse --remove tcp:38641',
    '-s 87a33a4b reverse tcp:38641 tcp:38641',
    '-s 87a33a4b reverse --remove tcp:38641'
  ]);
  const commands = execute.mock.calls.map(([, args]) => args.join(' '));
  expect(commands.indexOf('-s 87a33a4b shell am force-stop com.foliole.android'))
    .toBeLessThan(commands.indexOf('-s 87a33a4b reverse tcp:38641 tcp:38641'));
  expect(execute.mock.calls.at(-1)?.[1]).toEqual([
    '-s', '87a33a4b', 'uninstall', 'com.foliole.android.test'
  ]);
});

it('maps the fixed device port to an explicit isolated macOS listener', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'instrumentation',
    stdout: [
      'INSTRUMENTATION_STATUS: folioleActionReceipt={"departurePersisted":true}',
      'INSTRUMENTATION_STATUS: folioleAfterSemantic={}',
      'INSTRUMENTATION_CODE: -1'
    ].join('\n')
  } : successfulAdbResult(args));
  await runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'isolated',
    env: { FOLIOLE_COMPANION_SYNC_PORT: '38642' }, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  });
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse tcp:38641 tcp:38642')).toBe(true);
});

it('quotes journey counts across the adb shell boundary', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'instrumentation',
    stdout: [
      'INSTRUMENTATION_STATUS: folioleActionReceipt={"journeyFactsObserved":true}',
      'INSTRUMENTATION_STATUS: folioleAfterSemantic={}',
      'INSTRUMENTATION_CODE: -1'
    ].join('\n')
  } : successfulAdbResult(args));
  await runMacosA5SyncGroupMaintenance({
    action: 'observe-journey-facts', buildIdentity: 'quoted-counts', env: {}, evidenceRoot: root,
    execute, expectedJourneyCounts: { A: 1, B: 1, C: 1 },
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  });
  const instrument = execute.mock.calls.find(([, args]) => args.includes('instrument'))?.[1];
  expect(instrument).toContain('\'{"A":1,"B":1,"C":1}\'');
});

it('accepts an already absent owned reverse listener before the single bind', async () => {
  const root = createTestRoot();
  roots.push(root);
  let removeCount = 0;
  const execute = vi.fn();
  execute.mockImplementation(async (_command, args) => {
    if (args.join(' ') === '-s 87a33a4b reverse --remove tcp:38641') {
      removeCount += 1;
      if (removeCount === 1) return { code: 1,
        output: "adb: error: listener 'tcp:38641' not found\n", stdout: '' };
    }
    if (args.includes('instrument')) return { code: 0, output: 'instrumentation', stdout: [
      'INSTRUMENTATION_STATUS: folioleActionReceipt={"syncRequested":true,"actionStarted":true,"actionRunId":"run-1","terminalRunId":"run-1","terminalResult":"completed"}',
      'INSTRUMENTATION_STATUS: folioleAfterSemantic={}', 'INSTRUMENTATION_CODE: -1'
    ].join('\n') };
    return successfulAdbResult(args);
  });
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'sync-now', buildIdentity: 'absent-listener', env: {}, evidenceRoot: root, execute,
    observeWhileTransportOpen: async () => ({ exactFact: 'fact-a' }),
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  })).resolves.toMatchObject({ manifestPath: expect.any(String) });
});

it('returns an abnormal instrumentation exit as raw controller failure', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0',
    stdout: 'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0'
  } : successfulAdbResult(args));
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'build-crashed', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  })).rejects.toMatchObject({
    executionOwner: 'controller', failureAxis: 'execution', host: 'android-b',
    missingFact: 'android_instrumentation_terminal'
  });
});

it('preserves a lost Android window focus as an environment failure', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'java.lang.IllegalStateException: Foliole did not receive window focus;\nINSTRUMENTATION_CODE: -1',
    stdout: 'java.lang.IllegalStateException: Foliole did not receive window focus;\nINSTRUMENTATION_CODE: -1'
  } : successfulAdbResult(args));
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'clear-app-data', buildIdentity: 'build-2', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  })).rejects.toMatchObject({
    executionOwner: 'environment', failureAxis: 'execution', host: 'android-b',
    missingFact: 'android_instrumentation_terminal'
  });
});
