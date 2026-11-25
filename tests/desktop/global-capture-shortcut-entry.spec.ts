import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('shows the capture shortcut in General and opens its configuration', async ({ desktopWindow }, testInfo) => {
  const settings = await openSettingsCategory(desktopWindow, 'General');
  const captureSettings = settings.getByRole('region', { name: /^(Global capture settings|全局剪辑设置)$/ });
  const entry = captureSettings.getByRole('button', { name: /Configure shortcut for|设置.*快捷键/ });
  const captureCommand = '(?:Capture to (?:Inbox|收件箱) \\(global\\)|剪辑到收件箱（全局）)';
  const shortcutName = `(?:Shortcut for ${captureCommand}|${captureCommand} 的快捷键)`;
  const shortcut = settings.getByRole('button', { name: new RegExp(`^${shortcutName}$`) });
  const defaultShortcut = process.platform === 'darwin' ? '⌥ A' : 'Alt+Shift+C';

  await expect(entry).toHaveText(defaultShortcut);
  const screenshotPath = testInfo.outputPath('capture-shortcut-entry.png');
  await captureSettings.screenshot({ path: screenshotPath });
  await testInfo.attach('capture-shortcut-entry', { path: screenshotPath });
  await entry.click();
  await expect(shortcut).toBeFocused();
  await expect(shortcut).toHaveText(defaultShortcut);

  await settings.getByRole('button', { name: new RegExp(`^(?:Clear |清除)${shortcutName}$`) }).click();
  await openSettingsCategory(desktopWindow, 'General');
  await expect(entry).toHaveText(/^(Unassigned|未设置)$/);
  await entry.click();
  const addShortcutName = new RegExp(`^(?:Add shortcut for ${captureCommand}|为 ${captureCommand} 添加快捷键)$`);
  await expect(settings.getByRole('button', { name: addShortcutName })).toBeFocused();
});
