import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('hides right sidebar titlebar controls when the responsive layout hides the sidebar', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopApp.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    target?.setBounds({ width: 1200, height: 900, x: 80, y: 80 });
  });
  await desktopWindow.setViewportSize({ width: 1200, height: 900 });
  await expectWorkspaceShell(desktopWindow);

  const metrics = await desktopWindow.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('[aria-label="Foliole workspace"]');
    const rightAnchor = document.querySelector<HTMLElement>('.window-titlebar-right-anchor-shell');
    const rightSidebar = document.querySelector<HTMLElement>('[aria-label="Inspector"]');
    const windowControls = document.querySelector<HTMLElement>('.window-titlebar-controls');

    return {
      rightAnchorDisplay: rightAnchor ? getComputedStyle(rightAnchor).display : null,
      rightAnchorWidth: rightAnchor ? Math.round(rightAnchor.getBoundingClientRect().width) : null,
      rightSidebarDisplay: rightSidebar ? getComputedStyle(rightSidebar).display : null,
      rightSidebarWidth: rightSidebar ? Math.round(rightSidebar.getBoundingClientRect().width) : null,
      titlebarRightWidth: workspace
        ? getComputedStyle(workspace).getPropertyValue('--window-titlebar-right-width').trim()
        : null,
      windowControlsWidth: windowControls ? Math.round(windowControls.getBoundingClientRect().width) : null
    };
  });

  await testInfo.attach('responsive-titlebar-sidebar-metrics', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('responsive-titlebar-sidebar-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });

  await expect(desktopWindow.getByRole('button', { name: 'Toggle right sidebar' })).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: 'More right sidebar panels' })).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: 'Minimize' })).toBeVisible();
  expect(metrics.rightAnchorDisplay).toBe('none');
  expect(metrics.rightSidebarDisplay).toBe('none');
  expect(metrics.titlebarRightWidth).toBe('138px');
});
