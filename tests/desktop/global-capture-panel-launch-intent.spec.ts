import path from 'node:path';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

const SCREENSHOT_PATH = path.join(
  process.env.FOLIOLE_DESKTOP_ACCEPTANCE_DIR?.trim() || '.tmp/artifacts',
  'global-capture-panel-launch-intent.png'
);

test('opens the capture panel instead of the main window for the external launch intent', async () => {
  const session = await launchDesktopSession({
    appRoot: process.cwd(),
    extraArgs: ['--global-capture-panel']
  });

  try {
    const findPanelPage = async () => {
      for (const page of session.electronApp.windows()) {
        if (await page.locator('#capture').count()) return page;
      }
      return null;
    };
    await expect.poll(findPanelPage, { timeout: 15_000 }).toBeTruthy();
    const panelPage = await findPanelPage();
    if (!panelPage) throw new Error('capture panel page not found');

    const mainWindow = await session.electronApp.browserWindow(session.firstWindow);
    const capturePanel = await session.electronApp.browserWindow(panelPage);
    await expect.poll(() => mainWindow.evaluate((window) => window.isVisible())).toBe(false);
    await expect.poll(() => capturePanel.evaluate((window) => window.isVisible())).toBe(true);
    await expect.poll(() => panelPage.evaluate(() => document.activeElement?.id)).toBe('capture');
    await panelPage.screenshot({ path: SCREENSHOT_PATH });
  } finally {
    await session.close();
  }
});
