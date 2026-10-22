// @vitest-environment node
/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runA5CaptureAnnotation } from './android-a5-capture-annotation-action.mjs';
import { dispatchMacosA5Action } from './macos-a5-action-dispatch.mjs';
import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import {
  macosA5AppId, macosA5IdentityEnv, resolveMacosA5Identity
} from './macos-a5-app-identity.mjs';
import { collectStoppedAndroidSnapshot } from './macos-a5-existing-sync-acceptance.mjs';
import { parseMacosA5Invocation } from './macos-a5-formal-candidate.mjs';
import { runMacosA5SyncGroupJoinPrepareEntry } from './macos-a5-sync-group-join-prepare-entry.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { inspectA5SystemEntryDisplayName } from './macos-a5-system-entry-display-inspection.mjs';
import { restartA5 } from './macos-a5-system-entry-sync-action.mjs';

const DAILY = 'com.campfirium.foliole.android';
const TEST = 'com.campfirium.foliole.android.acceptance';
const testEnv = macosA5IdentityEnv({}, 'test');
const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function evidenceRoot() {
  const parent = path.join(process.cwd(), '.tmp', 'artifacts');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'a5-identity-test-'));
  roots.push(root);
  return root;
}

function packagesTouched(calls) {
  return calls.flatMap(([, args]) => args).filter((arg) => String(arg).startsWith(DAILY))
    .map((arg) => String(arg).split('/')[0]);
}

function successfulAdb(_command, args) {
  if (args.includes('instrument')) {
    const stdout = 'INSTRUMENTATION_STATUS: folioleActionReceipt={"ok":true}\nINSTRUMENTATION_CODE: -1';
    return { code: 0, output: stdout, stdout };
  }
  const output = args.includes('dumpsys') ? `${TEST}/com.foliole.android.MainActivity` : 'Success\n';
  return { code: 0, output, stdout: output };
}

it('selects the test application only through an explicit invocation flag', () => {
  expect(parseMacosA5Invocation(['sync-existing', '--formal', '--identity', 'test']))
    .toEqual({ action: 'sync-existing', formal: true, identity: 'test' });
  expect(parseMacosA5Invocation(['sync-existing'])).toEqual({ action: 'sync-existing', formal: false });
  expect(() => parseMacosA5Invocation(['deploy', '--identity', 'daily-copy'])).toThrow('--identity');
});

it('keeps daily-only actions away from the test identity and the reset away from the daily app', () => {
  for (const action of ['deploy', 'capture-annotation', 'system-entry-sync', 'sync-existing',
    'sync-group-join-prepare']) expect(resolveMacosA5Identity(action, 'test')).toBe('test');
  for (const action of ['pair-credentials', 'clear-app-data', 'leave-sync-group', 'device-profile']) {
    expect(() => resolveMacosA5Identity(action, 'test')).toThrow('test application');
  }
  expect(resolveMacosA5Identity('deploy')).toBe('daily');
  expect(resolveMacosA5Identity('reset-test-app')).toBe('test');
});

it('builds the test application with its own package and sync port', () => {
  expect(testEnv).toMatchObject({ FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: TEST,
    FOLIOLE_ANDROID_COMPANION_SYNC_PORT: '38644' });
  expect(macosA5AppId(testEnv)).toBe(TEST);
  expect(macosA5AppId(macosA5IdentityEnv(testEnv, 'daily'))).toBe(DAILY);
  const callerBuild = { FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: TEST };
  expect(macosA5IdentityEnv(callerBuild, 'daily')).toEqual(callerBuild);
});

it('replaces the port-sharing acceptance deploy with the test identity reset action', () => {
  expect(() => assertRegisteredMacosA5Action('deploy-acceptance')).toThrow('Usage');
  expect(assertRegisteredMacosA5Action('reset-test-app')).toMatchObject({
    deviceLeaseMode: 'mutation', formalSourceClass: 'ordinary-only', mutatesFixedA5: true
  });
});

it('resets only the test application packages', async () => {
  const execute = vi.fn(async () => ({ code: 0, output: 'Success\n' }));
  await dispatchMacosA5Action({ action: 'reset-test-app', assertFixed: vi.fn(), env: testEnv,
    execute, markMutationBoundary: vi.fn(), paths: { adb: '/adb' }, serial: '87a33a4b' });
  expect(new Set(packagesTouched(execute.mock.calls))).toEqual(new Set([TEST, `${TEST}.test`]));
  expect(execute.mock.calls.map(([, args]) => args.join(' ')))
    .toContain(`-s 87a33a4b uninstall ${TEST}`);
});

it('prepares a join on the test application without touching the daily one', async () => {
  const checked = vi.fn();
  await runMacosA5SyncGroupJoinPrepareEntry({ assertFixed: vi.fn(), build: vi.fn(),
    buildIdentity: () => 'build-1', checked, env: testEnv, protectData: vi.fn(async () => ({})),
    paths: { adb: '/adb', artifactsRoot: '/a', deviceBackupRoot: '/b' },
    serial: '87a33a4b' }, { mechanics: async (input) => {
    expect(macosA5AppId(input.env)).toBe(TEST);
    return { evidencePath: '/e.json', output: '' };
  } });
  expect(new Set(packagesTouched(checked.mock.calls))).toEqual(new Set([TEST]));
});

it('snapshots and restarts the test application during sync scenarios', async () => {
  const execute = vi.fn(async () => ({ code: 0 }));
  const collect = vi.fn(async () => ({ database: { integrity: 'ok' } }));
  const context = { env: testEnv, execute, paths: { adb: '/adb' }, serial: '87a33a4b' };
  await collectStoppedAndroidSnapshot(context, collect);
  await restartA5(context);
  expect(collect).toHaveBeenCalledWith(expect.objectContaining({ appId: TEST }));
  expect(new Set(packagesTouched(execute.mock.calls))).toEqual(new Set([TEST]));
});

it('keeps paired test data across instrumentation and never stops the daily application', async () => {
  const execute = vi.fn(async (command, args) => successfulAdb(command, args));
  await runMacosA5InstrumentationMechanics({ buildIdentity: 'build-1', env: testEnv,
    evidenceRoot: evidenceRoot(), execute, paths: { adb: '/adb', apk: '/app.apk',
      buildRoot: process.cwd() }, serial: '87a33a4b',
    testClass: 'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest#createsJourneyFact' });
  const commands = execute.mock.calls.map(([, args]) => args.join(' '));
  expect(commands).not.toContain(`-s 87a33a4b uninstall ${TEST}`);
  expect(commands).toContain('-s 87a33a4b install -r /app.apk');
  expect(new Set(packagesTouched(execute.mock.calls))).toEqual(new Set([TEST, `${TEST}.test`]));
});

it('still rebuilds a task-owned acceptance app fresh but never the daily app', async () => {
  const run = async (appId) => {
    const execute = vi.fn(async (command, args) => successfulAdb(command, args));
    await runMacosA5InstrumentationMechanics({ appId, buildIdentity: 'build-1', env: {},
      evidenceRoot: evidenceRoot(), execute, paths: { adb: '/adb', apk: '/app.apk',
        buildRoot: process.cwd() }, serial: '87a33a4b', instrumentationOwnsActivity: true,
      testClass: 'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest#createsJourneyFact' });
    return execute.mock.calls.map(([, args]) => args.join(' '));
  };
  const owned = await run(TEST);
  expect(owned.indexOf(`-s 87a33a4b uninstall ${TEST}`))
    .toBeLessThan(owned.indexOf('-s 87a33a4b install -r /app.apk'));
  expect((await run(DAILY)).filter((command) => / uninstall | pm clear /u.test(command)))
    .toEqual([`-s 87a33a4b uninstall ${DAILY}.test`]);
});

it('runs capture annotation against the test application packages', async () => {
  const execute = vi.fn(async () => { throw new Error('stop after first device command'); });
  const fsApi = { existsSync: () => true, mkdirSync: vi.fn(), readFileSync: () => 'apk',
    statSync: () => ({ size: 3 }) };
  await expect(runA5CaptureAnnotation({ adbPort: '5037', appId: TEST, buildIdentity: 'build-1',
    env: testEnv, evidenceRoot: '/e', execute, fsApi, paths: { adbPath: '/adb', buildRoot: '/repo' },
    serial: '87a33a4b' })).rejects.toThrow('stop after first device command');
  expect(packagesTouched(execute.mock.calls)).toEqual([TEST]);
});

it('inspects the system entry display through the test application runner', async () => {
  const execute = vi.fn(async (command, args) => successfulAdb(command, args));
  await inspectA5SystemEntryDisplayName({ buildIdentity: 'build-1', env: testEnv,
    evidenceRoot: evidenceRoot(), execute, paths: { adb: '/adb', buildRoot: '/repo' },
    serial: '87a33a4b' });
  expect(new Set(packagesTouched(execute.mock.calls))).toEqual(new Set([`${TEST}.test`]));
});
