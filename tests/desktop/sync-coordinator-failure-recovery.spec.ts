import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

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

test('settles an unresponsive mobile round and shows the persisted wait after reload', async ({ desktopApp, desktopWindow }, info) => {
  test.setTimeout(90_000);
  await expectWorkspaceShell(desktopWindow);
  const result = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const coordinator = require(`${process.cwd()}/dist/electron/sync/desktopSyncCoordinator.js`);
    const sessions = require(`${process.cwd()}/dist/electron/sync/desktopSyncChangeSessions.js`).desktopSyncChangeSessions();
    const phone = sessions.open('waiting-phone');
    const keepAlive = setInterval(() => sessions.signal('waiting-phone', phone.session), 10_000);
    try {
      const result = await coordinator.runDesktopSyncCoordinator('manual');
      return { status: result.status, active: coordinator.loadActiveDesktopSyncRun() !== null };
    } finally { clearInterval(keepAlive); sessions.closeAll(); }
  });
  expect(result).toEqual({ status: 'pending', active: false });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await openSettingsCategory(desktopWindow, 'Sync');
  await desktopWindow.getByRole('button', { name: /^(View log|查看日志)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /^(Sync log|同步日志)$/ });
  await expect(dialog.getByText(/Manual sync · Waiting for mobile device|手动同步 · 等待手机/)).toBeVisible();
  const imagePath = path.resolve('.tmp/artifacts/desktop-acceptance/s353-mobile-wait.png');
  await mkdir(path.dirname(imagePath), { recursive: true });
  await desktopWindow.screenshot({ path: imagePath });
  await info.attach('mobile-wait', { path: imagePath, contentType: 'image/png' });
});
