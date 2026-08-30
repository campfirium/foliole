import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
test('creates a persistent Sync Group from desktop settings', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  const section = settings.getByLabel(/^(Sync section|同步设置区)$/);
  const create = section.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ });

  await expect(create).toBeEnabled();
  await expect(section.getByRole('button', { name: /(primary device|主设备)/i })).toHaveCount(0);
  await expect(section.getByText(/(primary device|主设备)/i)).toHaveCount(0);
  await create.click();
  const devices = section.getByRole('list', { name: /^(Devices|设备)$/ });
  await expect(devices).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  await expect(devices.getByText(/^(macOS|Windows|Linux)$/)).toBeVisible();
  await expect(create).toHaveCount(0);
  const syncNow = section.getByRole('button', { name: /^(Sync Now|立即同步)$/ });
  const syncSwitch = section.getByRole('switch', { name: /^(Sync|同步)$/ });
  await expect(syncNow).toBeEnabled();
  await expect(syncSwitch).toHaveAttribute('aria-checked', 'true');
  const onScreenshot = await section.screenshot({ path: path.join(SCREENSHOT_DIR, 'settings-sync-group-on.png') });
  await testInfo.attach('settings-sync-group-on', { body: onScreenshot, contentType: 'image/png' });
  await syncSwitch.click();
  await expect(syncSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(syncNow).toBeEnabled();

  const offScreenshot = await section.screenshot({ path: path.join(SCREENSHOT_DIR, 'settings-sync-group-off.png') });
  await testInfo.attach('settings-sync-group-off', { body: offScreenshot, contentType: 'image/png' });
});
