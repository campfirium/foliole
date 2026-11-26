import { expect, test } from './harness/fixtures';
import { IMMERSIVE_READING_KEY } from './harness/immersiveReadingShortcut';
import { expectWorkspaceShell, resizeWorkspaceWindow } from './harness/settings';

test('performance statistics resume after docked, compact and immersive visibility changes', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await resizeWorkspaceWindow(desktopApp, desktopWindow, { percent: 93 });
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox').fill('performance');
  await desktopWindow.screenshot({ path: '.tmp/artifacts/T526/palette.png' });
  await palette.getByRole('button', { name: /^(DEV Open Performance Panel|DEV 打开性能面板)$/ }).click();
  const memory = desktopWindow.getByRole('heading', { name: /^(Memory|内存)$/ });
  await expect(memory).toBeVisible();
  const toggle = desktopWindow.locator('.window-titlebar').getByRole('button', {
    name: /^(Toggle right sidebar|切换右侧栏)$/
  });
  await toggle.click();
  await expect(memory).toHaveCount(0);
  await toggle.click();
  await expect(memory).toBeVisible();
  await desktopWindow.screenshot({ path: '.tmp/artifacts/T526/docked.png' });

  await resizeWorkspaceWindow(desktopApp, desktopWindow, { percent: 40 });
  await expect(memory).toHaveCount(0);
  await desktopWindow.mouse.move(desktopWindow.viewportSize()!.width - 60, 400);
  await expect(memory).toBeVisible();
  await desktopWindow.screenshot({ path: '.tmp/artifacts/T526/compact.png' });
  await desktopWindow.keyboard.press('Escape');
  await desktopWindow.mouse.move(400, 400);
  await expect(memory).toHaveCount(0);

  await resizeWorkspaceWindow(desktopApp, desktopWindow, { percent: 93 });
  await expect(memory).toBeVisible();
  await desktopWindow.keyboard.press(IMMERSIVE_READING_KEY);
  await expect(memory).toHaveCount(0);
  await desktopWindow.keyboard.press('Escape');
  await expect(memory).toBeVisible();
});
