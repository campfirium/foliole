import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('performance statistics resume after docked, compact and immersive visibility changes', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.setViewportSize({ width: 1400, height: 850 });
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.getByRole('textbox').fill('DEV Open Performance Panel');
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

  await desktopWindow.setViewportSize({ width: 1000, height: 850 });
  await expect(memory).toHaveCount(0);
  await toggle.click();
  await expect(memory).toBeVisible();
  await desktopWindow.screenshot({ path: '.tmp/artifacts/T526/compact.png' });
  await desktopWindow.keyboard.press('Escape');
  await expect(memory).toHaveCount(0);

  await desktopWindow.setViewportSize({ width: 1400, height: 850 });
  await expect(memory).toBeVisible();
  await desktopWindow.keyboard.press('F11');
  await expect(memory).toHaveCount(0);
  await desktopWindow.keyboard.press('Escape');
  await expect(memory).toBeVisible();
});
