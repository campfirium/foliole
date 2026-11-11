import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

test('tests HTTPS WebDAV credentials without enabling or saving the relay', async ({ desktopWindow }, testInfo) => {
  const url = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_URL;
  const password = process.env.FOLIOLE_TEST_AUTHENTICATED_WEBDAV_PASSWORD;
  // SKIP: requires a macOS Internal renderer and a dedicated HTTPS DAV sandbox | 2026-11-11 | revive: authenticated sandbox is provisioned by the native lane
  test.skip(process.platform !== 'darwin' || !url || !password, 'Requires an isolated authenticated DAV sandbox.');
  if (!url || !password) throw new Error('Test DAV sandbox is unavailable.');

  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsDialog(desktopWindow);
  await settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ }).click();
  await settings.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ }).click();
  await expect(settings.getByRole('list', { name: /^(Devices|设备)$/ })).toBeVisible();
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
  const folder = settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ });
  const username = settings.getByRole('textbox', { name: /^(Username|用户名)$/ });
  const secret = settings.getByLabel(/^(App password|应用密码)$/);
  const probe = settings.getByRole('button', { name: /^(Test credentials|测试凭据)$/ });
  await folder.fill(url);
  await username.fill('foliole-test-mac');
  await secret.fill('wrong-password');
  await probe.click();
  await expect(settings.getByText(/Could not sign in and access the folder|无法登录并访问目录/)).toBeVisible();
  await expect(secret).toHaveValue('');

  await secret.fill(password);
  await probe.click();
  await expect(settings.getByText(/WebDAV sign-in and folder access verified|已验证 WebDAV 登录和目录访问权限/)).toBeVisible();
  await expect(secret).toHaveValue('');
  await expect(settings.getByText(/^(Service not configured|服务未配置)$/)).toBeVisible();
  await testInfo.attach('webdav-credential-result', { body: await settings.screenshot(), contentType: 'image/png' });

  await settings.getByRole('button', { name: /^(Sync \(LAN\)|同步（局域网）)$/ }).click();
  await expect(folder).toHaveCount(0);
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
  await expect(folder).toHaveValue('');
  await expect(secret).toHaveValue('');
});
