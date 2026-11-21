// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { A5_TEST_APP_ID, macosA5IdentityEnv } from './macos-a5-app-identity.mjs';
import { leaveMacosA5TestAppSyncGroup } from './macos-a5-test-leave-sync-group.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true }); });

function leaveArgs(events, env = macosA5IdentityEnv({}, 'test')) {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-test-leave-'));
  roots.push(evidenceRoot);
  return {
    buildIdentity: 'build-1', env, evidenceRoot, serial: '87a33a4b',
    paths: { adb: '/adb', apk: '/test.apk' },
    execute: vi.fn(async (_adb, args) => { events.push(args.slice(2).join(' ')); return { code: 0 }; }),
    checked: (_adb, args) => events.push(args.slice(2).join(' ')),
    markMutationBoundary: () => events.push('mutation-boundary')
  };
}

const snapshot = inspection => async (options) => {
  expect(options.appId).toBe(A5_TEST_APP_ID);
  return { database: { integrity: 'ok', inspection } };
};

it('leaves the test group through the product once the test app is a member with nothing unsynced', async () => {
  const events = [];
  const maintenance = vi.fn(async () => ({ manifestPath: '/evidence/leave.json' }));
  const args = leaveArgs(events);
  const result = await leaveMacosA5TestAppSyncGroup(args, {
    collectSnapshot: snapshot({ syncGroupId: 'test-group', dirtyRecordCount: 0, nodeCount: 3280 }), maintenance
  });

  expect(events).toEqual([`shell am force-stop ${A5_TEST_APP_ID}`, 'mutation-boundary', 'install -r /test.apk']);
  expect(maintenance).toHaveBeenCalledWith(expect.objectContaining({
    action: 'leave-sync-group', appId: A5_TEST_APP_ID, installMain: false, buildIdentity: 'build-1'
  }));
  expect(result.manifestPath).toBe('/evidence/leave.json');
  expect(JSON.parse(fs.readFileSync(path.join(args.evidenceRoot, 'test-leave-preflight.json'), 'utf8')))
    .toMatchObject({ appId: A5_TEST_APP_ID, nodeCount: 3280, syncGroupId: 'test-group' });
});

it('refuses before any change when the test app is outside a group, has unsynced work, or cannot be read', async () => {
  for (const [inspection, message] of [
    [{ syncGroupId: null, dirtyRecordCount: 0 }, 'not in a sync group'],
    [{ syncGroupId: 'test-group', dirtyRecordCount: 4 }, '4 unsynced changes'],
    [null, 'snapshot is unavailable']
  ]) {
    const events = [];
    const maintenance = vi.fn();
    await expect(leaveMacosA5TestAppSyncGroup(leaveArgs(events), {
      collectSnapshot: async () => ({ database: inspection ? { integrity: 'ok', inspection } : null }), maintenance
    })).rejects.toThrow(message);
    expect(events).not.toContain('mutation-boundary');
    expect(events).not.toContain('install -r /test.apk');
    expect(maintenance).not.toHaveBeenCalled();
  }
});

it('never runs against the daily application', async () => {
  const events = [];
  const collectSnapshot = vi.fn();
  await expect(leaveMacosA5TestAppSyncGroup(leaveArgs(events, {}), { collectSnapshot, maintenance: vi.fn() }))
    .rejects.toThrow('A5 test application');
  expect(events).toEqual([]);
  expect(collectSnapshot).not.toHaveBeenCalled();
});
