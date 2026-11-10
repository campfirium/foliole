import { withWebDavFixture } from '../../electron/sync/webDavRelay.testSupport';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

test('configures WebDAV from its experimental settings page and reloads the saved service', async ({ desktopWindow }, testInfo) => {
  // SKIP: requires a macOS Internal renderer | 2026-11-10 | revive: WebDAV is available in the standard desktop acceptance build
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
  await expect(settings.getByText('Experiment', { exact: true })).toBeVisible();
  const folder = settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ });
  const connect = settings.getByRole('button', { name: /^(Connect|连接)$/ });
  await withWebDavFixture(false, async (url, files) => {
    await folder.fill(url);
    await connect.click();
    await expect(settings.getByText(/^(Service configured|服务已配置)$/)).toBeVisible();
    await expect(settings.getByText(`${url}/`, { exact: true })).toBeVisible();
    expect([...files]).toEqual([['/relay/keep.bin', 'existing']]);

    await lan.click();
    await expect(folder).toHaveCount(0);
    await webdav.click();
    await expect(settings.getByText(`${url}/`, { exact: true })).toBeVisible();
  });
  await testInfo.attach('webdav-settings', { body: await settings.screenshot(), contentType: 'image/png' });
});
