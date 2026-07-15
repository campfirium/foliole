import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

// SKIP: macOS-only native host acceptance | 2026-07-14 | revive: run on a darwin host
test.skip(process.platform !== 'darwin', 'macOS host acceptance');

test('exposes standard macOS menus and the registered global capture shortcut', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  const menu = await desktopApp.evaluate(({ Menu }) => {
    const root = Menu.getApplicationMenu();
    const flatten = (items: Electron.MenuItem[]): string[] => items.flatMap((item) => [
      item.role ?? '',
      ...(item.submenu ? flatten(item.submenu.items) : [])
    ]);
    return {
      rootRoles: root?.items.map((item) => item.role) ?? [],
      roles: root ? flatten(root.items) : []
    };
  });
  expect(menu.rootRoles).toEqual(expect.arrayContaining(['appmenu', 'editmenu', 'windowmenu']));
  expect(menu.roles).toEqual(expect.arrayContaining(['quit', 'copy', 'paste']));

  const general = await openSettingsCategory(desktopWindow, 'General');
  await expect(general.getByRole('switch', {
    name: /^(Start Foliole automatically|开机时自动启动 Foliole)$/
  })).toBeDisabled();
  await expect(general.getByText(/^(This is not available on macOS.|macOS 暂不支持此功能。)$/)).toBeVisible();

  await general.getByRole('button', { name: /^(Hotkeys|快捷键)$/ }).click();
  const hotkeys = general;
  const captureRow = hotkeys.getByRole('listitem').filter({
    hasText: /Capture to Inbox \(global\)|捕捉到 Inbox（全局）/
  });
  await expect(captureRow).toContainText('Command+Shift+C');
  await expect(captureRow).not.toContainText(/Unavailable|不可用/);
  await hotkeys.screenshot({ path: testInfo.outputPath('macos-host-readiness.png') });
});

test('finds the configured Codex app server from a packaged-like environment', async ({
  desktopWindow
}) => {
  const status = await desktopWindow.evaluate(() => window.electronAPI?.invoke('assistant_get_status'));
  expect(status).toMatchObject({ provider: 'codex-app-server', state: 'ready' });
});
