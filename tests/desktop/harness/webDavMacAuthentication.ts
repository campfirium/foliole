import type { ElectronApplication, Locator } from '@playwright/test';

import { expect } from './fixtures';

export async function replaceRejectedMacCredential(app: ElectronApplication, settings: Locator, password: string) {
  const phoneVersion = await app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    return require('./dist/electron/sync/webDavQueuedRotation.testSupport.js').rejectMacCredentialsWithTestRequest();
  });
  const notice = settings.getByText(/WebDAV rejected this Mac|WebDAV 拒绝了此 Mac 的凭据/);
  await expect(notice).toBeVisible();
  await settings.getByRole('button', { name: /^(Replace Mac credentials|更换 Mac 凭据)$/ }).click();
  await expect(settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ })).toBeDisabled();
  await settings.getByRole('textbox', { name: /^(Username|用户名)$/ }).fill('foliole-test-mac-new');
  const secret = settings.getByLabel(/^(App password|应用密码)$/);
  await secret.fill(password);
  await settings.getByRole('button', { name: /^(Test and save credentials|测试并保存凭据)$/ }).click();
  await expect(settings.getByText(/WebDAV credentials saved securely on this Mac|WebDAV 凭据已安全保存在此 Mac/)).toBeVisible();
  await expect(secret).toHaveValue('');
  await expect(notice).toHaveCount(0);
  const current = await app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { runWithDatabaseConnectionOwner } = require('./dist/electron/database/connection.js');
    const { loadDesktopBoundWebDavRelay } = require('./dist/electron/sync/desktopWebDavRelaySettings.js');
    return runWithDatabaseConnectionOwner(() => loadDesktopBoundWebDavRelay().credential_version);
  });
  expect(current).toBe(phoneVersion);
}
