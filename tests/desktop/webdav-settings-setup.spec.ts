import path from 'node:path';

import { startWebDavSetupFixture, fixtureCredentials } from '../../electron/sync/webDavSetupTls.testSupport';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, normalizeDesktopWindow, test, type DesktopSession } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

const SCREENSHOT_ROOT = path.resolve('.tmp/artifacts/T748-7');

async function openWebDav(session: DesktopSession) {
  const page = session.firstWindow;
  await page.evaluate(() => window.electronAPI.invoke('create_sync_group', {}));
  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
  await expect(settings.getByText(/dav\.example\.com\/storage\/Foliole\//)).toBeVisible();
  return settings;
}

test('guides WebDAV folder setup and recovers from a name collision', async ({ browserName }, info) => {
  void browserName;
  // SKIP: macOS WebDAV credential flow | 2026-11-11 | revive: another host supports DAV credentials
  test.skip(process.platform !== 'darwin', 'Authenticated WebDAV setup is available on macOS.');
  const server = await startWebDavSetupFixture(info.outputDir);
  const session = await launchDesktopSession({ extraArgs: ['--use-mock-keychain'] }).catch(async (error: unknown) => {
    await server.close();
    throw error;
  }) as DesktopSession;
  try {
    await normalizeDesktopWindow(session);
    expect(await session.electronApp.evaluate(({ app }, cert) => {
      const tls = process.getBuiltinModule('node:tls') as typeof import('node:tls');
      tls.setDefaultCACertificates([cert, ...tls.getCACertificates('default')]);
      return app.commandLine.hasSwitch('use-mock-keychain');
    }, server.cert)).toBe(true);
    const settings = await openWebDav(session);
    await settings.screenshot({ path: path.join(SCREENSHOT_ROOT, 'existing-folder.png') });

    const folder = settings.getByRole('textbox', { name: /New sync folder name|新同步文件夹名称/ });
    const password = settings.getByLabel(/^(WebDAV password|WebDAV 密码)$/);
    const create = settings.getByRole('button', { name: /^(Create, test, and save|创建、验证并保存)$/ });
    await folder.fill('occupied');
    await settings.getByRole('textbox', { name: /^(Parent WebDAV folder URL|上一级 WebDAV 文件夹地址)$/ }).fill(server.parent);
    await settings.getByRole('textbox', { name: /^(Username|用户名)$/ }).fill(fixtureCredentials.username);
    await password.fill(fixtureCredentials.password);
    await create.click();
    await expect(settings.getByText(/name may already be in use|该名称可能已被占用/)).toBeVisible();
    await settings.screenshot({ path: path.join(SCREENSHOT_ROOT, 'name-collision.png') });
    expect(server.requests).toEqual(['PROPFIND /storage/', 'MKCOL /storage/occupied/']);

    await folder.fill('Foliole');
    await password.fill(fixtureCredentials.password);
    await create.click();
    await expect(settings.getByText(/Connection verified\. WebDAV credentials|连接验证通过。WebDAV 凭据/)).toBeVisible();
    await expect(settings.getByRole('textbox', { name: /^(WebDAV folder URL|WebDAV 目录地址)$/ })).toHaveValue(`${server.parent}Foliole/`);
    await expect(password).toBeEmpty();
    expect(server.directories.has('/storage/Foliole/')).toBe(true);
    expect(server.files.get('/storage/occupied/keep.bin')).toBe('existing file');
  } finally {
    await session.close();
    await server.close();
  }
});
