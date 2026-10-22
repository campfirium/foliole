import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const DAY = 24 * 60 * 60 * 1000;

async function evidence(page: Page, info: TestInfo, name: string) {
  const screenshot = await page.screenshot({ path: path.join(process.cwd(), '.tmp/artifacts/t384-expired-member', `${name}.png`) });
  await info.attach(name, { body: screenshot, contentType: 'image/png' });
}

const overview = (page: Page) => page.evaluate(() => window.electronAPI.invoke('load_sync_group_overview'));

/** A group whose two other members kept syncing while this device last synced 100 days earlier. */
function seedExpiredMember(_electron: unknown, input: { now: number; day: number }) {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const path = process.getBuiltinModule('path')!;
  const load = (file: string) => require(path.join(process.cwd(), 'dist', file));
  const connection = load('electron/database/connection.js');
  return connection.runWithDatabaseConnectionOwner(() => {
    const groups = load('electron/database/syncGroupStore.js');
    const identity = load('lib/platform/syncGroupUnifiedContract.js');
    const groupId = 'expired-member-acceptance';
    const device = (anchor: string, libraryPath: string) => identity.createSyncGroupDeviceIdentity({
      device_anchor: anchor, group_id: groupId, library_path: libraryPath, path_flavor: 'posix' });
    const local = device('11111111-1111-4111-8111-111111111111', connection.openDatabaseConnection().dbPath);
    const office = device('22222222-2222-4222-8222-222222222222', '/isolated-office/foliole.db');
    const laptop = device('33333333-3333-4333-8333-333333333333', '/isolated-laptop/foliole.db');
    const joined = new Date(input.now - 200 * input.day).toISOString();
    groups.createDesktopSyncGroup({ device: local, deviceName: 'Isolated Mac', platform: 'darwin', now: joined });
    groups.registerSyncGroupDevice({ device: office, deviceName: 'Office desktop', platform: 'darwin', now: joined });
    groups.registerSyncGroupDevice({ device: laptop, deviceName: 'Laptop', platform: 'darwin', now: joined });
    const recent = new Date(input.now - input.day).toISOString();
    const silent = new Date(input.now - 100 * input.day).toISOString();
    const cells = { [office.identity_key]: { [laptop.identity_key]: recent, [local.identity_key]: silent },
      [laptop.identity_key]: { [office.identity_key]: recent }, [local.identity_key]: { [office.identity_key]: silent } };
    connection.openDatabaseConnection().driver.execute(`INSERT INTO sync_group_metadata (key, value, updated_at)
      VALUES (?, ?, ?)`, [`sync_group_coverage:${groupId}`, JSON.stringify({ basis: '', cells }), recent]);
    return { groupId };
  });
}

function adoptionState() {
  const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
  const path = process.getBuiltinModule('path')!;
  const connection = require(path.join(process.cwd(), 'dist', 'electron/database/connection.js'));
  return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver
    .queryOne("SELECT count(*) AS adopting FROM sync_group_metadata WHERE key = 'sync_group_local_adoption'"));
}

test('asks before overwriting a device that fell more than 90 days behind its sync group', async ({ desktopApp, desktopWindow }, info) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopApp.evaluate(seedExpiredMember, { now: Date.now(), day: DAY });
  expect((await overview(desktopWindow)).expired_member).toBe(true);

  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(settings.getByText(/^(This device hasn’t synced for over 90 days|本机已超过 90 天未同步)$/)).toBeVisible();
  await expect(settings.getByText(/changes made here that never synced will not be kept|本机从未同步出去的改动不会保留/)).toBeVisible();
  await evidence(desktopWindow, info, 'expired-notice');

  const action = settings.getByRole('button', { name: /^(Overwrite this device|覆盖本机)$/ });
  await action.click();
  const confirm = desktopWindow.getByRole('dialog', { name: /^(Overwrite this device with the sync group’s data\?|用同步组资料覆盖本机？)$/ });
  await expect(confirm).toContainText(/never synced will be lost|从未同步出去的改动会丢失/);
  await evidence(desktopWindow, info, 'expired-confirmation');
  await confirm.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await expect(confirm).toHaveCount(0);
  expect(await desktopApp.evaluate(adoptionState)).toEqual({ adopting: 0 });
  expect((await overview(desktopWindow)).expired_member).toBe(true);

  // With no current peer reachable, confirming must not switch this device into overwriting.
  await action.click();
  await confirm.getByRole('button', { name: /^(Overwrite this device|覆盖本机)$/ }).click();
  await expect(settings.getByText(/No other device in the sync group is reachable right now|暂时连不上同步组里的其他设备/)).toBeVisible();
  expect(await desktopApp.evaluate(adoptionState)).toEqual({ adopting: 0 });
  expect((await overview(desktopWindow)).expired_member).toBe(true);
  await evidence(desktopWindow, info, 'expired-no-current-peer');
});
