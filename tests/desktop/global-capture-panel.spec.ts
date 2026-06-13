import { test, expect, type ElectronApplication, type Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

declare global {
  interface Window {
    __folioleGlobalCapturePanelResultForTests?: unknown;
    __folioleShowGlobalCapturePanelForTests?: () => void;
  }
}

async function showCapturePanel(electronApp: ElectronApplication) {
  await expect.poll(async () => {
    try {
      await electronApp.evaluate(() => {
        if (!globalThis.__folioleShowGlobalCapturePanelForTests) {
          throw new Error('missing global capture panel test hook');
        }
        globalThis.__folioleShowGlobalCapturePanelForTests();
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Execution context was destroyed')) return false;
      throw error;
    }
  }).toBe(true);
}

async function findCapturePanelPage(electronApp: ElectronApplication) {
  return expect.poll(async () => {
    for (const page of electronApp.windows()) {
      if (await page.locator('#capture').count()) return page;
    }
    return null;
  }).toBeTruthy();
}

async function getCapturePanelPage(electronApp: ElectronApplication) {
  await findCapturePanelPage(electronApp);
  const panelPage = await Promise.all(electronApp.windows().map(async (page) => ({
    count: await page.locator('#capture').count(),
    page
  })));
  const match = panelPage.find((entry) => entry.count > 0)?.page;
  if (!match) throw new Error('capture panel page not found');
  return match;
}

async function expectCaptureFocused(panelPage: Page) {
  await expect.poll(async () => panelPage.evaluate(() => document.activeElement?.id ?? null)).toBe('capture');
}

async function getCapturePanelBounds(electronApp: ElectronApplication) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      !window.isDestroyed() && window.webContents.getURL().startsWith('data:text/html;charset=utf-8,')
    );
    if (!panel) throw new Error('capture panel window not found');
    return panel.getBounds();
  });
}

test('focuses the global capture panel and submits from Enter', async ({ browserName }) => {
  void browserName;
  const session = await launchDesktopSession();
  try {
    await showCapturePanel(session.electronApp);
    const panelPage = await getCapturePanelPage(session.electronApp);
    await expectCaptureFocused(panelPage);

    await panelPage.keyboard.type('Playwright capture panel text');
    await panelPage.keyboard.press('Enter');

    await expect.poll(async () => session.electronApp.evaluate(() =>
      globalThis.__folioleGlobalCapturePanelResultForTests ?? null
    )).toEqual({
      text: 'Playwright capture panel text',
      type: 'text'
    });
  } finally {
    await session.close();
  }
});

test('drags the global capture panel from its visible surface', async ({ browserName }) => {
  void browserName;
  const session = await launchDesktopSession();
  try {
    await showCapturePanel(session.electronApp);
    const panelPage = await getCapturePanelPage(session.electronApp);
    await expectCaptureFocused(panelPage);

    const before = await getCapturePanelBounds(session.electronApp);
    await panelPage.mouse.move(72, 214);
    await panelPage.mouse.down();
    await panelPage.mouse.move(192, 274, { steps: 8 });
    await panelPage.mouse.up();

    await expect.poll(async () => {
      const after = await getCapturePanelBounds(session.electronApp);
      return after.x - before.x;
    }).toBeGreaterThan(80);
    await expect.poll(async () => {
      const after = await getCapturePanelBounds(session.electronApp);
      return after.y - before.y;
    }).toBeGreaterThan(40);
  } finally {
    await session.close();
  }
});
