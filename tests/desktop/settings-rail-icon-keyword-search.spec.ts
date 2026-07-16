import { test, expect } from './harness/fixtures';

test('filters left toolbar action icons by Lucide keyword terms', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.getByRole('button', { name: /^(Settings|设置)$/ }).click();

  const settingsDialog = desktopWindow.getByRole('dialog').filter({
    has: desktopWindow.getByRole('button', { name: /^(Left toolbar|左侧工具栏)$/ })
  });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: /^(Left toolbar|左侧工具栏)$/ }).click();
  await settingsDialog.getByRole('button', { name: /^(Add action|添加操作)$/ }).click();

  const addActionDialog = desktopWindow.getByRole('dialog', { name: /^(Add action|添加操作)$/ });
  await expect(addActionDialog).toBeVisible();
  await addActionDialog.getByRole('button').first().click();
  await addActionDialog.getByLabel(/^(Search icons|搜索图标)$/).fill('discuss');

  await expect(addActionDialog.getByRole('button', { name: /^(Use Messages Square icon|使用 Messages Square 图标)$/ })).toBeVisible();
  await testInfo.attach('settings-rail-icon-keyword-search', {
    body: await desktopWindow.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
});
