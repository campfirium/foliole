import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const USES_NATIVE_MACOS_CONTROLS = process.platform === 'darwin';
const TOGGLE_LEFT_PANEL_NAME = /^(Toggle left panel|切换左侧面板)$/;

async function readRailMetrics(page: Page) {
  return page.evaluate(() => {
    const titlebar = document.querySelector<HTMLElement>('.window-titlebar');
    const documentSurface = document.querySelector<HTMLElement>('[data-workspace-surface-column="document"]');
    const railDivider = document.querySelector<HTMLElement>('[data-workspace-surface-divider="rail"]');
    const mainRail = document.querySelector<HTMLElement>('.workspace-region-main-rail');
    const titlebarLeft = titlebar?.getBoundingClientRect().left ?? 0;
    return {
      documentSurfaceLeft: documentSurface
        ? Math.round(documentSurface.getBoundingClientRect().left - titlebarLeft)
        : null,
      leadingSurfaceCount: document.querySelectorAll('[data-workspace-titlebar-leading-surface]').length,
      mainRailWidth: mainRail ? Math.round(mainRail.getBoundingClientRect().width) : null,
      railDividerLeft: railDivider ? Math.round(railDivider.getBoundingClientRect().left - titlebarLeft) : null
    };
  });
}

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
  const railMetrics = await readRailMetrics(desktopWindow);

  const metrics = await desktopWindow.evaluate(() => {
    const titlebar = document.querySelector<HTMLElement>('.window-titlebar');
    const rightAnchor = document.querySelector<HTMLElement>('.window-titlebar-right-anchor-shell');
    const rightSidebar = document.querySelector<HTMLElement>('[aria-label="Inspector"]');
    const windowControls = document.querySelector<HTMLElement>('.window-titlebar-controls');

    return {
      rightAnchorDisplay: rightAnchor ? getComputedStyle(rightAnchor).display : null,
      rightAnchorWidth: rightAnchor ? Math.round(rightAnchor.getBoundingClientRect().width) : null,
      rightSidebarDisplay: rightSidebar ? getComputedStyle(rightSidebar).display : null,
      rightSidebarWidth: rightSidebar ? Math.round(rightSidebar.getBoundingClientRect().width) : null,
      titlebarGridColumns: titlebar ? getComputedStyle(titlebar).gridTemplateColumns : null,
      titlebarOwnRightWidth: titlebar
        ? getComputedStyle(titlebar).getPropertyValue('--window-titlebar-right-width').trim()
        : null,
      windowControlsWidth: windowControls ? Math.round(windowControls.getBoundingClientRect().width) : null
    };
  });

  await testInfo.attach('responsive-titlebar-sidebar-metrics', {
    body: JSON.stringify({ ...metrics, ...railMetrics }, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('responsive-titlebar-sidebar-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });

  await expect(desktopWindow.getByRole('button', { name: 'Toggle right sidebar' })).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: 'More right sidebar panels' })).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: 'Minimize' }))
    .toHaveCount(USES_NATIVE_MACOS_CONTROLS ? 0 : 1);
  expect(metrics.rightAnchorDisplay).toBe('none');
  expect(metrics.rightSidebarDisplay).toBeNull();
  const expectedRightWidth = USES_NATIVE_MACOS_CONTROLS ? '0px' : '138px';
  expect(metrics.titlebarOwnRightWidth).toBe(expectedRightWidth);
  expect(metrics.titlebarGridColumns).toMatch(new RegExp(`${expectedRightWidth}$`));
  expect(railMetrics.leadingSurfaceCount).toBe(0);
  expect(railMetrics.railDividerLeft).toBe(40);
  expect(railMetrics.mainRailWidth).toBe(40);
});

test('removes the left list titlebar reserve when the responsive layout hides the list', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopApp.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    target?.setBounds({ width: 1000, height: 900, x: 80, y: 80 });
  });
  await desktopWindow.setViewportSize({ width: 1000, height: 900 });
  await expectWorkspaceShell(desktopWindow);
  const railMetrics = await readRailMetrics(desktopWindow);

  const metrics = await desktopWindow.evaluate(() => {
    const titlebar = document.querySelector<HTMLElement>('.window-titlebar');
    const titlebarDividers = Array.from(titlebar?.children ?? []).filter((element) => {
      const node = element as HTMLElement;
      return node.getAttribute('aria-hidden') === 'true' && node.style.left.trim().length > 0;
    }) as HTMLElement[];

    return {
      titlebarVisibleDividerCount: titlebarDividers.filter((divider) => getComputedStyle(divider).display !== 'none').length,
      titlebarGridColumns: titlebar ? getComputedStyle(titlebar).gridTemplateColumns : null,
      titlebarLeftWidth: titlebar
        ? getComputedStyle(titlebar).getPropertyValue('--window-titlebar-left-width').trim()
        : null,
      titlebarListWidth: titlebar
        ? getComputedStyle(titlebar).getPropertyValue('--workspace-titlebar-list-current-width').trim()
        : null
    };
  });

  await testInfo.attach('responsive-titlebar-left-metrics', {
    body: JSON.stringify({ ...metrics, ...railMetrics }, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('responsive-titlebar-left-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });

  await expect(desktopWindow.getByRole('button', { name: TOGGLE_LEFT_PANEL_NAME })).toBeVisible();
  expect(metrics.titlebarLeftWidth).toBe('40px');
  expect(metrics.titlebarListWidth).toBe('0px');
  expect(metrics.titlebarGridColumns).toMatch(/^40px /);
  expect(metrics.titlebarVisibleDividerCount).toBe(1);
  expect(railMetrics.documentSurfaceLeft).toBe(40);
  expect(railMetrics.leadingSurfaceCount).toBe(0);
  expect(railMetrics.railDividerLeft).toBe(40);
  expect(railMetrics.mainRailWidth).toBe(40);
});
