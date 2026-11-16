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
  await desktopWindow.setViewportSize({ width: 1600, height: 1000 });
  const general = await openSettingsCategory(desktopWindow, 'General');
  const section = general.getByRole('region', { name: 'Foliole Aide' });

  await expect(section.getByRole('heading', { name: 'Foliole Aide' })).toBeVisible();
  await expect(section.getByRole('heading', { name: /^(Local conversation data|本机对话数据)$/ })).toBeVisible();
  await expect(section).toContainText(/(?:stored on this device|保存在本机)/);
  await expect(section).toContainText(/(?:Aide|aide)/);
  const openFolder = section.getByRole('button', { name: /^(Open folder|打开文件夹)$/ });
  await expect(openFolder).toBeEnabled();

  const screenshot = await section.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-aide-storage', {
    body: screenshot,
    contentType: 'image/png'
  });

  const folderEdge = await openFolder.evaluate((button) => button.getBoundingClientRect().right);
  const testButton = section.getByRole('button', { exact: true, name: /^(Test|测试)$/ });
  const testEdge = await testButton.evaluate((button) => button.getBoundingClientRect().right);
  expect(Math.abs(testEdge - folderEdge)).toBeLessThan(1);
});
