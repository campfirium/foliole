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

test('keeps the right sidebar button available when the sidebar floats', async ({
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
  const toggle = desktopWindow.locator('.window-titlebar [data-workspace-sidebar-toggle="right"]');
  const sidebar = desktopWindow.locator('.workspace-floating-sidebar-right');
  const documentArea = desktopWindow.locator('[data-workspace-document-focus-target]');
  await expect(toggle).toBeVisible();
  await expect(sidebar).toBeHidden();
  const before = await documentArea.boundingBox();
  expect(before?.width).toBeGreaterThan(0);

  await toggle.click();
  await expect(sidebar).toBeVisible();
  expect(await documentArea.boundingBox()).toEqual(before);
  await testInfo.attach('responsive-titlebar-sidebar-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });

  await toggle.click();
  await expect(sidebar).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: /^(Minimize|最小化)$/ }))
    .toHaveCount(USES_NATIVE_MACOS_CONTROLS ? 0 : 1);
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

test('aligns the ordinary document title with the document pane', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.setViewportSize({ width: 1600, height: 900 });
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => {
    const debug = window.__folioleWorkspaceDebug!;
    await debug.seedNodes([{ id: 'titlebar-alignment', title: 'Document title alignment', kind: 'topic', content: 'Body' }]);
    await debug.openNode('titlebar-alignment');
  });
  const title = desktopWindow.locator('.window-titlebar-center-title');
  await expect(title).toHaveText('Document title alignment');
  const pane = desktopWindow.locator('[data-workspace-document-focus-target]');
  const alignment = async () => {
    const [label, document] = await Promise.all([title.boundingBox(), pane.boundingBox()]);
    return Math.abs(label!.x + label!.width / 2 - document!.x - document!.width / 2);
  };
  await expect.poll(alignment).toBeLessThanOrEqual(1);
  await desktopWindow.screenshot({ path: testInfo.outputPath('ordinary-titlebar.png') });
});
