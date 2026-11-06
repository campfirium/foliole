import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('collapsed right sidebar toggle has breathing room at the window edge and restores the sidebar', async ({
  desktopWindow
}) => {
  await desktopWindow.setViewportSize({ width: 1400, height: 900 });
  await expectWorkspaceShell(desktopWindow);
  const titlebar = desktopWindow.locator('.window-titlebar');
  const toggle = titlebar.locator('[data-workspace-sidebar-toggle="right"]');
  if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  const readSpacing = () => toggle.evaluate((button) => {
    const bar = button.closest('.window-titlebar')!;
    const controls = bar.querySelector('.window-titlebar-controls');
    const edge = (controls ?? bar).getBoundingClientRect();
    const icon = button.querySelector('svg')!.getBoundingClientRect();
    return {
      gap: (controls ? edge.left : edge.right) - icon.right,
      centered: Math.abs((icon.top + icon.bottom) / 2 - (edge.top + edge.bottom) / 2)
    };
  });
  if (await titlebar.getAttribute('data-window-controls') !== 'custom') {
    await expect.poll(async () => (await readSpacing()).gap).toBeGreaterThanOrEqual(16);
    expect((await readSpacing()).gap).toBeLessThanOrEqual(18);
  }
  expect((await readSpacing()).centered).toBeLessThanOrEqual(1);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/right-sidebar-collapsed-spacing.png' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(titlebar.locator('.window-titlebar-right-panel-actions')).toBeVisible();
  const panelBounds = await titlebar.locator('.window-titlebar-right-panel-actions').boundingBox();
  const toggleBounds = await toggle.boundingBox();
  expect(toggleBounds!.x + toggleBounds!.width).toBeLessThanOrEqual(panelBounds!.x);
  await desktopWindow.screenshot({ path: '.tmp/artifacts/right-sidebar-expanded-spacing.png' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
