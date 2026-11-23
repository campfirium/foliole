import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openAideSettingsDialog } from './harness/settings';

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/settings-aide-storage-hidden.png'
);

test('shows device-local Foliole Aide storage in Aide settings', async ({
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.setViewportSize({ width: 1600, height: 1000 });
  const aideDialog = await openAideSettingsDialog(desktopWindow);
  const section = aideDialog.getByRole('region', { name: /^(Local conversation data|本机对话数据)$/ });

  await expect(section.getByRole('heading', { name: /^(Local conversation data|本机对话数据)$/ })).toBeVisible();
  await expect(section).toContainText(/(?:stored on this device|保存在本机)/);
  const openFolder = section.getByRole('button', { name: /^(Open folder|打开文件夹)$/ });
  await expect(openFolder).toBeEnabled();

  const screenshot = await section.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-aide-storage', {
    body: screenshot,
    contentType: 'image/png'
  });

  const folderEdge = await openFolder.evaluate((button) => button.getBoundingClientRect().right);
  // The folder button lines up with the model table's connection column (the ChatGPT plan row's status or action).
  const connectionCell = aideDialog.getByRole('table', { name: /^(Aide model settings|Aide 模型设置)$/ })
    .getByText(/^(ChatGPT plan|ChatGPT 套餐)$/)
    .locator('xpath=..')
    .locator(':scope > div:last-child > *')
    .first();
  const connectionEdge = await connectionCell.evaluate((element) => element.getBoundingClientRect().right);
  expect(Math.abs(connectionEdge - folderEdge)).toBeLessThan(1);
});
