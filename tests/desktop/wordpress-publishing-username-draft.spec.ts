import { expect, test } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

async function openWordPressSettings(desktopWindow: import('@playwright/test').Page) {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publish|发布)$/ }).click();
  const region = dialog.getByRole('region', {
    name: /^(WordPress publish settings|WordPress 发布设置)$/
  });
  const section = region.getByRole('button', { name: 'Publish to WordPress' });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  return { dialog, region };
}

test('keeps the WordPress username before a password is entered', async ({ desktopWindow }) => {
  const opened = await openWordPressSettings(desktopWindow);
  await opened.region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/)
    .fill('folioleapp.wordpress.com');
  await opened.region.getByLabel(/^(WordPress username|WordPress 用户名)$/).fill('folioleapp');
  await opened.dialog.getByRole('button', { name: /^(General|通用)$/ }).click();

  const returned = await openWordPressSettings(desktopWindow);
  await expect(returned.region.getByLabel(/^(WordPress site address|WordPress 站点地址)$/))
    .toHaveValue('https://folioleapp.wordpress.com');
  await expect(returned.region.getByLabel(/^(WordPress username|WordPress 用户名)$/))
    .toHaveValue('folioleapp');
  await expect(returned.region.getByLabel(/^WordPress Application Password$/)).toHaveValue('');

  await desktopWindow.keyboard.press('Escape');
  await expect(returned.dialog).not.toBeVisible();
  const reopened = await openWordPressSettings(desktopWindow);
  await expect(reopened.region.getByLabel(/^(WordPress username|WordPress 用户名)$/))
    .toHaveValue('folioleapp');
});
