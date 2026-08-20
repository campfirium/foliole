import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT_PATH = path.join(
  process.cwd(), '.tmp/artifacts/desktop-acceptance/settings-sync-group.png'
);
const UNGROUPED_SCREENSHOT_PATH = path.join(
  process.cwd(), '.tmp/artifacts/desktop-acceptance/settings-ungrouped-device.png'
);

test('creates a persistent Sync Group from desktop settings', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  const section = settings.getByLabel(/^(Sync section|同步设置区)$/);
  const create = section.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ });
  const ungroupedDevices = section.getByRole('list', { name: /^(Devices|设备)$/ });

  await expect(create).toBeEnabled();
  await expect(section.getByRole('button', { name: /(primary device|主设备)/i })).toHaveCount(0);
  await expect(section.getByText(/(primary device|主设备)/i)).toHaveCount(0);
  await expect(ungroupedDevices).toBeVisible();
  await expect(ungroupedDevices.getByRole('listitem')).toHaveCount(1);
  await expect(ungroupedDevices.getByText(/^(macOS|Windows|Linux)$/)).toBeVisible();
  const ungroupedScreenshot = await section.screenshot({ path: UNGROUPED_SCREENSHOT_PATH });
  await testInfo.attach('settings-ungrouped-device', { body: ungroupedScreenshot, contentType: 'image/png' });
  await create.click();
  const devices = section.getByRole('list', { name: /^(Devices|设备)$/ });
  await expect(devices).toBeVisible();
  await expect(devices.getByRole('listitem')).toHaveCount(1);
  await expect(devices.getByText(/^(macOS|Windows|Linux)$/)).toBeVisible();
  await expect(create).toHaveCount(0);

  const screenshot = await section.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-sync-group', { body: screenshot, contentType: 'image/png' });
});
