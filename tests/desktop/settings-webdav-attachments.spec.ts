import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

test('saves and reloads WebDAV attachment settings from the native settings page', async ({ desktopWindow }, testInfo) => {
  // SKIP: requires a macOS Internal renderer | 2026-11-11 | revive: WebDAV is available in the standard desktop acceptance build
  test.skip(process.platform !== 'darwin' || process.env.FOLIOLE_ACCEPT_EXPERIMENTAL_WEBDAV !== '1',
    'Requires a macOS Internal renderer.');
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsDialog(desktopWindow);
  const lan = settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ });
  const webdav = settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ });
  await lan.click();
  await settings.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ }).click();
  await expect(settings.getByRole('list', { name: /^(Devices|设备)$/ })).toBeVisible();
  await webdav.click();

  const attachments = settings.getByRole('radiogroup', { name: /^(Attachment sync|附件同步)$/ });
  const unlimited = attachments.getByRole('radio', { name: /^(No size limit|不限制大小)$/ });
  const limited = attachments.getByRole('radio', { name: /^(Limit size|限制大小)$/ });
  const off = attachments.getByRole('radio', { name: /^(Skip attachments|不同步附件)$/ });
  const size = settings.getByRole('spinbutton', { name: /^(Maximum file size \(MiB\)|单文件大小上限（MiB）)$/ });
  const save = settings.getByRole('button', { name: /^(Save|保存)$/, exact: true });
  await expect(unlimited).toBeChecked();
  await expect(save).toHaveCount(0);
  await off.click();
  await expect(off).toBeEnabled();
  await lan.click();
  await webdav.click();
  await expect(off).toBeChecked();
  await limited.click();
  await size.fill('0');
  await size.blur();
  await expect(off).toBeChecked();
  await limited.click();
  await size.fill('2');
  await size.press('Enter');
  await expect(limited).toBeEnabled();
  await lan.click();
  await webdav.click();
  await expect(limited).toBeChecked();
  await expect(size).toHaveValue('2');
  const screenshot = testInfo.outputPath('webdav-attachment-settings.png');
  await settings.screenshot({ path: screenshot });
  await testInfo.attach('webdav-attachment-settings', { path: screenshot });
  await size.fill('3');
  await size.blur();
  await expect(limited).toBeEnabled();
  await lan.click();
  await webdav.click();
  await expect(size).toHaveValue('3');
  await unlimited.click();
  await expect(unlimited).toBeEnabled();
  await lan.click();
  await webdav.click();
  await expect(unlimited).toBeChecked();
});
