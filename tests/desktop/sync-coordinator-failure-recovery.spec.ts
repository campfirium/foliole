import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('settles every queued offline target and retains the durable failure after reload', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const moduleUrl = path.resolve('dist/electron/sync/desktopSyncCoordinator.js');
  const result = await desktopApp.evaluate(async (_, url) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const coordinator = require(url);
    const { runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const runs = ['offline-a', 'offline-b', 'offline-c'].map((peerId) =>
      coordinator.runDesktopSyncCoordinator('manual', {
        endpoint_url: 'http://127.0.0.1:0', group_id: 'isolated-offline-test',
        local_device_id: 'local', peer_device_id: peerId,
        peer_device_name: peerId, peer_platform: 'desktop', route_kind: 'member'
      }));
    const outcomes = await Promise.allSettled(runs);
    return {
      outcomes: outcomes.map((outcome) => outcome.status),
      active: coordinator.loadActiveDesktopSyncRun() !== null,
      persisted: await runWithDatabaseConnectionOwner(() => coordinator.loadDesktopSyncTriggerResult())
    };
  }, moduleUrl);
  expect(result.outcomes).toEqual(['rejected', 'rejected', 'rejected']);
  expect(result.active).toBe(false);
  expect(result.persisted).toMatchObject({ reason: 'manual', status: 'failed' });
  expect(result.persisted.error).toBeTruthy();
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const persisted = await desktopApp.evaluate(async (_, url) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const coordinator = require(url);
    const { runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return runWithDatabaseConnectionOwner(() => coordinator.loadDesktopSyncTriggerResult());
  }, moduleUrl);
  expect(persisted).toEqual(result.persisted);
});
