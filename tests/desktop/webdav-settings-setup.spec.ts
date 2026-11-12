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

async function launchSetupSession(cert: string, stateRoot: string) {
  const session = await launchDesktopSession({
    env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot },
    extraArgs: ['--use-mock-keychain']
  }) as DesktopSession;
  try {
    await normalizeDesktopWindow(session);
    expect(await session.electronApp.evaluate(({ app }, certificate) => {
      const tls = process.getBuiltinModule('node:tls') as typeof import('node:tls');
      tls.setDefaultCACertificates([certificate, ...tls.getCACertificates('default')]);
      return app.commandLine.hasSwitch('use-mock-keychain');
    }, cert)).toBe(true);
    return session;
  } catch (error) {
    await session.close();
    throw error;
  }
}

test('restores a failed four-field setup after restart and retries with the default folder', async ({ browserName }, info) => {
  void browserName;
  // SKIP: WebDAV setup uses the macOS credential store | 2026-11-12 | revive: another desktop host supports WebDAV credentials
  test.skip(process.platform !== 'darwin', 'Requires the macOS credential store.');
  const server = await startWebDavSetupFixture(info.outputDir);
  const stateRoot = path.join(info.outputDir, 'setup-state');
  let session: DesktopSession | undefined;
  try {
    session = await launchSetupSession(server.cert, stateRoot);
    await session.firstWindow.evaluate(() => window.electronAPI.invoke('create_sync_group', {}));
    let settings = await openWebDav(session);
    await expect(settings.getByText('Experiment', { exact: true })).toHaveCount(0);
    const address = () => settings.getByRole('textbox', { name: /^(WebDAV URL|WebDAV 网址)$/ });
    const folder = () => settings.getByRole('textbox', { name: /^(Folder name|文件夹名)$/ });
    const password = () => settings.getByLabel(/^(App password|应用密码)$/);
    const connect = () => settings.getByRole('button', { name: /^(Connect|连接)$/ });
    await expect(folder()).toBeEmpty();
    await expect(folder()).toHaveAttribute('placeholder', 'foliole');
    await connect().scrollIntoViewIfNeeded();
    await settings.screenshot({ path: path.join(SCREENSHOT_ROOT, 'webdav-four-fields.png') });

    await address().fill(server.parent);
    const username = () => settings.getByRole('textbox', { name: /^(Username|用户名)$/ });
    await username().fill(fixtureCredentials.username);
    await password().fill(fixtureCredentials.password);
    await folder().fill('invalid/name');
    await connect().click();
    await expect(settings.getByText(/Enter a single folder name|请输入单个文件夹的名称/)).toBeVisible();
    await expect(password()).toHaveValue(fixtureCredentials.password);

    await session.close();
    session = await launchSetupSession(server.cert, stateRoot);
    settings = await openWebDav(session);
    await expect(address()).toHaveValue(server.parent);
    await expect(username()).toHaveValue(fixtureCredentials.username);
    await expect(folder()).toHaveValue('invalid/name');
    await expect(password()).toHaveAttribute('placeholder', /^(Password saved|已保存密码)$/);
    await expect(password()).toBeEmpty();
    await folder().clear();
    await connect().click();
    await expect(settings.getByText(/Connection verified\. WebDAV credentials|连接验证通过。WebDAV 凭据/)).toBeVisible();
    await expect(address()).toHaveValue(server.parent);
    await expect(folder()).toHaveValue('foliole');
    await expect(password()).toBeEmpty();
    expect(server.requests.filter(request => request.startsWith('MKCOL'))).toEqual(['MKCOL /storage/foliole/']);
    expect(server.directories.has('/storage/foliole/')).toBe(true);
    expect(server.files.get('/storage/occupied/keep.bin')).toBe('existing file');
    await session.firstWindow.reload();
    await openWebDav(session);
    await expect(address()).toHaveValue(server.parent);
    await expect(folder()).toHaveValue('foliole');
  } finally {
    await session?.close();
    await server.close();
  }
});
