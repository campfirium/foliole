import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/settings-aide-storage-hidden.png'
);

test('shows device-local Foliole Aide storage in General settings', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const general = await openSettingsCategory(desktopWindow, 'General');
  const section = general.getByLabel(/Foliole Aide (?:storage section|存储设置区)/);

  await expect(section.getByRole('heading', { name: 'Foliole Aide' })).toBeVisible();
  await expect(section.getByRole('heading', { name: /^(Device data|本机数据)$/ })).toBeVisible();
  await expect(section).toContainText(/(?:stay on this device|保存在这台设备上)/);
  await expect(section).toContainText(/(?:Aide|aide)/);
  await expect(section.getByRole('button', { name: /^(Open location|打开位置)$/ })).toBeEnabled();

  const screenshot = await section.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-aide-storage', {
    body: screenshot,
    contentType: 'image/png'
  });
});
