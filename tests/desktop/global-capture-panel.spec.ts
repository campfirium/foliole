import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { waitForDesktopAppReady } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';

const DARK_PANEL_SCREENSHOT_PATH = path.join(
  process.env.FOLIOLE_DESKTOP_ACCEPTANCE_DIR?.trim() || '.tmp/artifacts',
  'global-capture-panel-dark.png'
);

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

async function setDarkMode(desktopWindow: Page, timeoutMs: number) {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-base-color', 'dark');
  });
  await desktopWindow.reload();
  await waitForDesktopAppReady(desktopWindow, timeoutMs);
}

function readRgbLightness(value: string) {
  const channels = value.match(/\d+(?:\.\d+)?/gu)?.slice(0, 3).map(Number) ?? [];
  if (channels.length < 3) throw new Error(`unsupported rgb color: ${value}`);
  return (channels[0]! + channels[1]! + channels[2]!) / 3;
}

test('focuses the global capture panel and submits from Enter', async ({ desktopSession }) => {
  await showCapturePanel(desktopSession.electronApp);
  const panelPage = await getCapturePanelPage(desktopSession.electronApp);
  await expectCaptureFocused(panelPage);

  await panelPage.keyboard.type('Playwright capture panel text');
  await panelPage.keyboard.press('Enter');

  await expect.poll(async () => desktopSession.electronApp.evaluate(() =>
    globalThis.__folioleGlobalCapturePanelResultForTests ?? null
  )).toEqual({ text: 'Playwright capture panel text', type: 'text' });
});

test('drags the global capture panel from its visible surface', async ({ desktopSession }) => {
  await showCapturePanel(desktopSession.electronApp);
  const panelPage = await getCapturePanelPage(desktopSession.electronApp);
  await expectCaptureFocused(panelPage);

  const before = await getCapturePanelBounds(desktopSession.electronApp);
  await panelPage.mouse.move(72, 214);
  await panelPage.mouse.down();
  await panelPage.mouse.move(192, 274, { steps: 8 });
  await panelPage.mouse.up();

  await expect.poll(async () => (await getCapturePanelBounds(desktopSession.electronApp)).x - before.x)
    .toBeGreaterThan(80);
  await expect.poll(async () => (await getCapturePanelBounds(desktopSession.electronApp)).y - before.y)
    .toBeGreaterThan(40);
});

test('uses the dark floating surface when the workspace is in dark mode', async ({ desktopSession }) => {
  await setDarkMode(desktopSession.firstWindow, desktopSession.timeoutMs);
  await showCapturePanel(desktopSession.electronApp);
  const panelPage = await getCapturePanelPage(desktopSession.electronApp);
  await expectCaptureFocused(panelPage);

  const colors = await panelPage.evaluate(() => {
    const root = document.documentElement;
    const surface = document.querySelector<HTMLElement>('.capture-surface');
    if (!surface) throw new Error('capture surface not found');
    const surfaceStyle = getComputedStyle(surface);
    return {
      background: surfaceStyle.backgroundColor,
      foreground: surfaceStyle.color,
      rootBackground: getComputedStyle(root).getPropertyValue('--capture-bg').trim()
    };
  });
  await panelPage.screenshot({ path: DARK_PANEL_SCREENSHOT_PATH });

  expect(colors.rootBackground).toBe(colors.background);
  expect(readRgbLightness(colors.background)).toBeLessThan(100);
  expect(readRgbLightness(colors.foreground)).toBeGreaterThan(140);
});
