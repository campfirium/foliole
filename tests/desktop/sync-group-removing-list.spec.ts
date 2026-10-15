import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function capture(page: Page, info: TestInfo, name: string) {
  const file = path.resolve('.tmp/artifacts/t346', `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await info.attach(name, { path: file, contentType: 'image/png' });
}

test('shows a separate pending target with confirmer names and hides it after durable completion', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const ids = await desktopApp.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (file: string) => require(`${process.cwd()}/dist/${file}`);
    const connection = load('electron/database/connection.js');
    return connection.runWithDatabaseConnectionOwner(() => {
      const groups = load('electron/database/syncGroupStore.js');
      const identity = load('lib/platform/syncGroupUnifiedContract.js');
      const devices = [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333'
      ].map((anchor, index) => identity.createSyncGroupDeviceIdentity({
        device_anchor: anchor, group_id: 'removing-list-native',
        library_path: index ? `/isolated/${index}/foliole.db` : connection.openDatabaseConnection().dbPath,
        path_flavor: 'posix'
      }));
      groups.createDesktopSyncGroup({ device: devices[0], deviceName: 'Native Mac', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: devices[1], deviceName: 'Remaining peer', platform: 'darwin' });
      groups.registerSyncGroupDevice({ device: devices[2], deviceName: 'Old phone', platform: 'ios-capacitor' });
      return { remaining: devices[1].identity_key, target: devices[2].identity_key };
    });
  });
  await desktopWindow.evaluate(deviceId => window.electronAPI.invoke('remove_sync_group_device', {
    device_identity_key: deviceId
  }), ids.target);
  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  const pending = settings.getByRole('table', { name: /^(Removing|移除中)$/ });
  await expect(pending).toBeVisible();
  await expect(pending.getByRole('row', { name: /Old phone/ })).toContainText('Native Mac');
  await expect(settings.getByRole('list').getByText('Old phone')).toHaveCount(0);
  await capture(desktopWindow, testInfo, 'removing-with-confirmers');
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const restored = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(restored.getByRole('table', { name: /^(Removing|移除中)$/ })).toContainText('Old phone');
  // A member snapshot is fixture input here; the HTTP suite proves how a real peer produces it.
  await desktopApp.evaluate(async (_electron, peerId) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const members = require(`${process.cwd()}/dist/electron/database/syncGroupMemberStateStore.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const state = members.loadDesktopSyncGroupMemberState();
      state.sender_device_identity_key = peerId;
      for (const removal of state.removals) removal.confirmations.push({
        confirming_device_identity_key: peerId, kind: 'enforced', confirmed_at: new Date().toISOString()
      });
      members.applyDesktopSyncGroupMemberState(state, peerId);
    });
  }, ids.remaining);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const completed = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(completed.getByRole('table', { name: /^(Removing|移除中)$/ })).toHaveCount(0);
  await expect(completed.getByText('Old phone')).toHaveCount(0);
  await capture(desktopWindow, testInfo, 'removing-complete');
});
