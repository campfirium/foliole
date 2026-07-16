import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('organizes controls and keeps capture behavior in General', async ({ desktopSession, desktopWindow }, testInfo) => {
  const general = await openSettingsCategory(desktopWindow, 'General');
  await expect(general.getByText(/^(Selection access|选区访问)$/)).toBeVisible();
  await expect(general.getByRole('button', { name: /^(Capture|剪辑)$/ })).toHaveCount(0);
  const position = general.getByRole('combobox', { name: /^(Confirmation position|完成提示位置)$/ });
  await expect(position).toHaveValue('top-right');
  await position.selectOption('bottom-right');
  await expect(position).toHaveValue('bottom-right');

  const controls = general.getByText(/^(Controls|操作)$/).locator('..').locator('..');
  await expect(controls.getByRole('button')).toHaveText([
    /^(Hotkeys|快捷键)$/,
    /^(Ribbon|功能区)$/,
    /^(Mouse gestures|鼠标手势)$/,
    /^(Right-click menu|右键菜单)$/
  ]);
  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/settings-controls-hidden-native.png');
  await general.screenshot({ path: screenshotPath });
  await testInfo.attach('settings-controls', { path: screenshotPath });

  const hotkeys = await openSettingsCategory(desktopWindow, 'Hotkeys');
  const globalCaptureShortcut = hotkeys.getByRole('button', {
    name: /^(Shortcut for Capture to Inbox \(global\)|Capture to Inbox \(global\) 的快捷键)$/
  });
  await expect(globalCaptureShortcut).toHaveText(/⌥ ⇧ C|Alt\+Shift\+C/u);
  await globalCaptureShortcut.click();
  await expect(globalCaptureShortcut).toHaveText(/^(Press hotkey\.\.\.|按下快捷键\.\.\.)$/);
  await desktopSession.electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())?.webContents.send(
      'foliole:native-keyboard-input',
      {
        altKey: false,
        code: 'KeyX',
        controlKey: false,
        key: 'x',
        metaKey: true,
        shiftKey: true,
        type: 'keyDown'
      }
    );
  });
  await expect(globalCaptureShortcut).toHaveText('⇧ ⌘ X');

  await expect.poll(() => desktopWindow.evaluate(async () => {
    const result = await globalThis.window?.electronAPI?.invoke('load_desktop_host_capabilities', {});
    return result?.globalCaptureShortcutLabel;
  })).toBe('Command+Shift+X');
});
