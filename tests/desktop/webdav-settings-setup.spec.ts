import path from 'node:path';

import { startWebDavSetupFixture, fixtureCredentials } from '../../electron/sync/webDavSetupTls.testSupport';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, normalizeDesktopWindow, test, type DesktopSession } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

const SCREENSHOT_ROOT = path.resolve('.tmp/artifacts/T748-7');

async function openWebDav(session: DesktopSession) {
  const page = session.firstWindow;
  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /^(Sync \(WebDAV\)|同步（WebDAV）)$/ }).click();
  await expect(settings.getByText(/dav\.example\.com\/storage\//)).toBeVisible();
  return settings;
}

test('uses the default folder on Connect and reopens it as separate fields', async ({ browserName }, info) => {
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
    await session.firstWindow.evaluate(() => window.electronAPI.invoke('create_sync_group', {}));
    const settings = await openWebDav(session);
    const address = settings.getByRole('textbox', { name: /^(WebDAV URL|WebDAV 网址)$/ });
    const folder = settings.getByRole('textbox', { name: /^(Folder name|文件夹名)$/ });
    const password = settings.getByLabel(/^(App password|应用密码)$/);
    const connect = settings.getByRole('button', { name: /^(Connect|连接)$/ });
    await expect(folder).toBeEmpty();
    await expect(folder).toHaveAttribute('placeholder', 'foliole');
    await connect.scrollIntoViewIfNeeded();
    await settings.screenshot({ path: path.join(SCREENSHOT_ROOT, 'webdav-four-fields.png') });

    await address.fill(server.parent);
    await settings.getByRole('textbox', { name: /^(Username|用户名)$/ }).fill(fixtureCredentials.username);
    await password.fill(fixtureCredentials.password);
    await connect.click();
    await expect(settings.getByText(/Connection verified\. WebDAV credentials|连接验证通过。WebDAV 凭据/)).toBeVisible();
    await expect(address).toHaveValue(server.parent);
    await expect(folder).toHaveValue('foliole');
    await expect(password).toBeEmpty();
    expect(server.requests.filter(request => request.startsWith('MKCOL'))).toEqual(['MKCOL /storage/foliole/']);
    expect(server.directories.has('/storage/foliole/')).toBe(true);
    expect(server.files.get('/storage/occupied/keep.bin')).toBe('existing file');
    await session.firstWindow.reload();
    await openWebDav(session);
    await expect(address).toHaveValue(server.parent);
    await expect(folder).toHaveValue('foliole');
  } finally {
    await session.close();
    await server.close();
  }
});
