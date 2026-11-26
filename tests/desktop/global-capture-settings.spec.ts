import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument, loadWorkspaceSnapshot } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('localizes the capture and YouTube shortcuts in Simplified Chinese', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const hotkeys = await openSettingsCategory(desktopWindow, 'Hotkeys');
  await expect(hotkeys.getByText('剪辑到收件箱（全局）', { exact: true })).toBeVisible();
  await expect(hotkeys.getByText('全局剪辑', { exact: true })).toBeVisible();
  await hotkeys.getByRole('searchbox', { name: '搜索快捷键' }).fill('YouTube');
  await expect(hotkeys.getByText('打开 YouTube', { exact: true })).toBeVisible();
  await testInfo.attach('localized-hotkeys', { body: await hotkeys.screenshot(), contentType: 'image/png' });
});

test('keeps quick capture in the left toolbar and clears the title bar', async ({ desktopSession, desktopWindow }, testInfo) => {
  const { electronApp } = desktopSession;
  const capture = /^(Global capture|全局剪辑)$/;
  const toolbar = desktopWindow.getByRole('region', { name: /^(Left toolbar|左侧工具栏)$/ });
  const titleBar = desktopWindow.locator('.window-titlebar');
  const titleBarButton = titleBar.getByRole('button', { name: capture });
  const inspectorToggle = titleBar.getByRole('button', { name: /^(Toggle right sidebar|切换右侧栏)$/ });
  const text = 'Capture saved from the workspace toolbar';
  await expectWorkspaceShell(desktopWindow);
  await expect(titleBarButton).toHaveCount(0);
  const initialSidebar = await inspectorToggle.getAttribute('aria-pressed');
  await inspectorToggle.click();
  await expect(inspectorToggle).toHaveAttribute('aria-pressed', initialSidebar === 'true' ? 'false' : 'true');
  await expect(titleBarButton).toHaveCount(0);
  await inspectorToggle.click();
  const screenshotPath = testInfo.outputPath('workspace-capture-buttons.png');
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('workspace-capture-buttons', { path: screenshotPath });

  const findPanel = async () => {
    for (const page of electronApp.windows()) {
      if (await page.locator('#capture').count()) return page;
    }
    return null;
  };
  await toolbar.getByRole('button', { name: capture }).click();
  await expect.poll(findPanel).toBeTruthy();
  const panel = (await findPanel())!;
  const input = panel.locator('#capture');
  await expect(input).toBeFocused();
  await input.fill('Discard this capture');
  await input.press('Escape');
  const panelWindow = await electronApp.browserWindow(panel);
  await expect.poll(() => panelWindow.evaluate((window) => window.getOpacity())).toBe(0);

  await toolbar.getByRole('button', { name: capture }).click();
  await expect.poll(() => panelWindow.evaluate((window) => window.getOpacity())).toBe(1);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.fill(text);
  await input.press('Enter');
  await expect.poll(() => panelWindow.evaluate((window) => window.getOpacity())).toBe(0);

  const findSavedCapture = async () => Object.values((await loadWorkspaceSnapshot(desktopWindow))?.nodesById ?? {})
    .find((node) => node.title === text)?.id;
  await expect.poll(findSavedCapture, { message: 'The capture should be saved to the library' }).toBeTruthy();
  const nodeId = (await findSavedCapture())!;

  const findCapture = (title: string) => desktopWindow.evaluate((targetTitle) =>
    window.__folioleWorkspaceDebug?.listNodes().find((node) => node.title === targetTitle)?.id, title
  );
  await expect.poll(() => findCapture(text)).toBe(nodeId);
  expect(await findCapture('Discard this capture')).toBeUndefined();
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await expect.poll(async () => (await loadNodeDocument(desktopWindow, nodeId))?.content).toContain(text);
});

test('organizes controls and keeps capture behavior in General', async ({ desktopSession, desktopWindow }, testInfo) => {
  const general = await openSettingsCategory(desktopWindow, 'General');
  const captureSettings = general.getByRole('region', { name: /^(Global capture settings|全局剪辑设置)$/ });
  await expect(captureSettings.getByText(/leave it empty and press Enter|留空直接按回车/i)).toBeVisible();
  await expect(captureSettings.getByText(/^(Accessibility permission|辅助功能权限)$/)).toBeVisible();
  await expect(general.getByRole('button', { name: /^(Capture|剪辑)$/ })).toHaveCount(0);
  const position = general.getByRole('combobox', { name: /^(Confirmation position|完成提示位置)$/ });
  await expect(position).toHaveValue('top-right');
  await position.selectOption('bottom-right');
  await expect(position).toHaveValue('bottom-right');

  const controls = general.getByText(/^(Controls|操作)$/).locator('..').locator('..');
  await expect(controls.getByRole('button')).toHaveText([
    /^(Hotkeys|快捷键)$/,
    /^(Left toolbar|左侧工具栏)$/,
    /^(Editor menu|编辑器菜单)$/,
    /^(Mouse gestures|鼠标手势)$/,
    /^(Right-click menu|右键菜单)$/
  ]);
  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/settings-controls-hidden-native.png');
  await general.screenshot({ path: screenshotPath });
  await testInfo.attach('settings-controls', { path: screenshotPath });

  const hotkeys = await openSettingsCategory(desktopWindow, 'Hotkeys');
  const globalCaptureShortcut = hotkeys.getByRole('button', {
    name: /^(Shortcut for Capture to Inbox \(global\)|剪辑到收件箱（全局） 的快捷键)$/
  });
  await expect(globalCaptureShortcut).toHaveText(/⌥ A|Alt\+A/u);
  await globalCaptureShortcut.click();
  await expect(globalCaptureShortcut).toHaveText(/^(Press hotkey\.\.\.|按下快捷键\.\.\.)$/);
  await desktopSession.electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())?.webContents.send(
      'foliole:native-keyboard-input',
      {
        altKey: true,
        code: 'KeyC',
        controlKey: false,
        key: 'ç',
        metaKey: false,
        shiftKey: false,
        type: 'keyDown'
      }
    );
  });
  await expect(globalCaptureShortcut).toHaveText('⌥ C');

  await expect.poll(() => desktopWindow.evaluate(async () => {
    const result = await globalThis.window?.electronAPI?.invoke('load_desktop_host_capabilities', {});
    return {
      label: result?.globalCaptureShortcutLabel,
      registered: result?.globalCaptureShortcutRegistered
    };
  })).toEqual({ label: 'Alt+C', registered: true });
  await expect(hotkeys.getByText(/^(Shortcut is already in use and isn't active yet\.|快捷键被占用，暂未生效。)$/)).toHaveCount(0);
  const hotkeyScreenshotPath = path.join(process.cwd(), '.tmp/artifacts/global-capture-hotkey-active-hidden-native.png');
  await hotkeys.screenshot({ path: hotkeyScreenshotPath });
  await testInfo.attach('global-capture-hotkey-active', { path: hotkeyScreenshotPath });
});
