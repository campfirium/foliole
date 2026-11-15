import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('sidebar layout shows the actual window-to-work-area ratio after a native resize', async ({
  desktopApp, desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsCategory(desktopWindow, 'Appearance');
  const section = settings.getByRole('region', { name: /^(Sidebar layout|侧栏布局)$/ });
  const ratio = section.getByRole('status');

  const resizeTo = (width: number) => desktopApp.evaluate(({ BrowserWindow, screen }, requestedWidth) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.setResizable(true);
    if (window.isMaximized()) window.unmaximize();
    window.setSize(requestedWidth, 850);
    const bounds = window.getBounds();
    return Math.round(100 * bounds.width / screen.getDisplayMatching(bounds).workArea.width);
  }, width);

  const first = await resizeTo(960);
  await expect(ratio).toHaveText(`${first}%`);
  const second = await resizeTo(1260);
  expect(second).not.toBe(first);
  await expect(ratio).toHaveText(`${second}%`);
});
