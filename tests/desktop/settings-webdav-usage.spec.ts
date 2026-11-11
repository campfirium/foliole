import { withWebDavFixture } from '../../electron/sync/webDavRelay.testSupport';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

test('shows usage from failed and retried WebDAV connections in each time range', async ({ desktopWindow }, testInfo) => {
  // SKIP: requires a macOS Internal renderer | 2026-11-10 | revive: WebDAV is available in the standard desktop acceptance build
  test.skip(process.platform !== 'darwin' || process.env.FOLIOLE_ACCEPT_EXPERIMENTAL_WEBDAV !== '1',
    'Requires a macOS Internal renderer.');
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsDialog(desktopWindow);
  await settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ }).click();
  await settings.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ }).click();
  await expect(settings.getByRole('list', { name: /^(Devices|设备)$/ })).toBeVisible();
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();

  await expect(settings.getByText(/Requests: 0 · Uploaded: 0 B · Downloaded: 0 B|请求 0 次 · 上传 0 B · 下载 0 B/)).toBeVisible();
  const folder = settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ });
  const connect = settings.getByRole('button', { name: /^(Connect|连接)$/ });
  await withWebDavFixture(true, async (url, files) => {
    await folder.fill(url);
    await connect.click();
    await expect(settings.getByText(/Requests: 6 · Uploaded: 36 B · Downloaded: 11 B|请求 6 次 · 上传 36 B · 下载 11 B/)).toBeVisible();
    expect([...files]).toEqual([['/relay/keep.bin', 'existing']]);
  });
  await withWebDavFixture(false, async (url, files) => {
    await folder.fill(url);
    await connect.click();
    await expect(settings.getByText(/^(Service configured|服务已配置)$/)).toBeVisible();
    expect([...files]).toEqual([['/relay/keep.bin', 'existing']]);
  });
  const usage = settings.getByText(/Requests: 11 · Uploaded: 72 B · Downloaded: 47 B|请求 11 次 · 上传 72 B · 下载 47 B/);
  await expect(usage).toBeVisible();
  for (const period of [/^(30 minutes|30 分钟)$/, /^(1 hour|1 小时)$/]) {
    const option = settings.getByRole('radio', { name: period });
    await option.click();
    await expect(option).toBeChecked();
    await expect(usage).toBeVisible();
  }
  await settings.getByRole('button', { name: /^(Refresh usage|刷新用量)$/ }).click();
  await expect(usage).toBeVisible();
  await testInfo.attach('webdav-usage', { body: await settings.screenshot(), contentType: 'image/png' });
});
