// @vitest-environment node
/* global console, process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5OrdinaryJourneyEntry } from './android-a5-ordinary-journey-action.mjs';
import {
  A5_ORDINARY_APP_ID, A5_ORDINARY_TEST_CLASS,
  parseA5OrdinaryJourneyInstrumentation
} from './android-a5-ordinary-journey-contract.mjs';

const roots = [];

function instrumentation(token) {
  return [
    `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify({
      captureCreated: true, ok: true, syncedContentVisible: true,
      targetTestId: 'companion-ordinary-journey', token,
      visibleAfterRelaunch: true, visibleBeforeRelaunch: true
    })}`,
    'INSTRUMENTATION_STATUS: folioleAfterSemantic={"location":"/","elements":[]}',
    'INSTRUMENTATION_CODE: -1', ''
  ].join('\n');
}

function result(stdout = '') {
  return { code: 0, lines: stdout.split(/\r?\n/u).filter(Boolean), output: stdout,
    stderr: '', stdout };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.promises.rm(root, { force: true, recursive: true });
});

it('composes the existing product join with visible content, capture, relaunch, and cleanup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-ordinary-'));
  roots.push(root);
  const installed = new Set([A5_ORDINARY_APP_ID]);
  const session = {
    accept: vi.fn(), close: vi.fn(), enable: vi.fn(async () => ({ group: true })),
    load: vi.fn(async () => ({ sync_group: { devices: [
      { device_identity_key: 'device-a5', device_name: 'A5' }
    ] } }))
  };
  const mechanics = vi.fn(async (args) => {
    if (args.testClass.includes('FolioleCompanionSyncGroupJoinTest#')) {
      const observation = await args.observeWhileTransportOpen({});
      args.validateInstrumentation({ evidencePath: '/join.json', stdout: 'joined' });
      return { observation, output: 'join\n', stdout: 'joined' };
    }
    expect(args.installMain).toBe(false);
    expect(args.instrumentationArgs).toContain('expectedSyncedText');
    return { output: 'ordinary\n', stdout: instrumentation('ordinary-run-1') };
  });
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('packages')) {
      const applicationId = args.at(-1);
      return result(installed.has(applicationId) ? `package:${applicationId}\n` : '');
    }
    if (args.includes('uninstall')) {
      installed.delete(args.at(-1)); return result('Success\n');
    }
    throw new Error(`Unexpected ADB call: ${args.join(' ')}`);
  });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);

  const returned = await runMacosA5OrdinaryJourneyEntry({
    assertFixed: vi.fn(), buildIdentity: () => 'ordinary-run-1', checked: vi.fn(), env: {},
    execute, paths: { adb: '/adb', artifactsRoot: path.join(root, 'artifacts'), buildRoot: root },
    serial: '87a33a4b'
  }, {
    assertServer: () => ({ sync_group: { group_id: 'group-1', group_tag: 'a'.repeat(32) } }),
    buildAcceptance: () => ({ ACCEPTANCE: '1' }),
    createFact: async () => ({ factId: 'desktop-fact-1' }), mechanics,
    openSession: async () => session,
    validateJoin: vi.fn(), waitForRequest: async () => ({ device_name: 'A5', request_id: 'request-1' })
  });

  expect(session.accept).toHaveBeenCalledWith(expect.anything());
  expect(session.close).toHaveBeenCalledOnce();
  expect(mechanics).toHaveBeenCalledTimes(2);
  expect(mechanics.mock.calls[1][0]).toMatchObject({
    appId: A5_ORDINARY_APP_ID, testClass: A5_ORDINARY_TEST_CLASS
  });
  expect(installed.size).toBe(0);
  const manifest = JSON.parse(fs.readFileSync(returned.manifestPath, 'utf8'));
  expect(manifest).toMatchObject({
    action: 'ordinary-journey', applicationId: A5_ORDINARY_APP_ID,
    cleanup: { mainPackageRemoved: true, testPackageRemoved: true },
    desktopFactId: 'desktop-fact-1', joinedDeviceId: 'device-a5',
    result: { captureCreated: true, syncedContentVisible: true,
      visibleAfterRelaunch: true, visibleBeforeRelaunch: true },
    resultStatus: 'success', runId: 'ordinary-run-1', schemaVersion: 1
  });
});

it('accepts only complete same-run visible product evidence', () => {
  expect(parseA5OrdinaryJourneyInstrumentation(instrumentation('ordinary-run-2'), 'ordinary-run-2'))
    .toMatchObject({ receipt: { syncedContentVisible: true, visibleAfterRelaunch: true } });
  expect(() => parseA5OrdinaryJourneyInstrumentation(
    instrumentation('another-run'), 'ordinary-run-2'
  )).toThrow('another run');
});

it('contains no source preparation, fixed endpoint, database audit, or new provider', () => {
  const source = fs.readFileSync('scripts/android/android-a5-ordinary-journey-action.mjs', 'utf8');
  expect(source).toContain('buildA5TwoDeviceAcceptance');
  expect(source).toContain('openMacosSyncGroupDesktopSession');
  expect(source).toContain('FolioleCompanionSyncGroupJoinTest');
  expect(source).not.toMatch(/git.*(?:fetch|pull|reset|clean)|endpoint_url|database.*audit/iu);
  expect(source).not.toContain('runFriSyncGroupProvider');
});
