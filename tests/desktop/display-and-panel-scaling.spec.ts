import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

test('app display size and focused panel content size remain independent', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const settingsDialog = await openSettingsCategory(desktopWindow, 'Appearance');
  const displayScale = settingsDialog.getByLabel(/App display size percentage|应用显示大小百分比/);
  await displayScale.fill('130');
  await expect(displayScale).toHaveValue('130');

  const browserWindow = await desktopSession.electronApp.browserWindow(desktopWindow);
  await expect.poll(() => browserWindow.evaluate((window) => window.webContents.getZoomFactor())).toBeCloseTo(1.3, 4);
  await desktopWindow.keyboard.press('Escape');

  const folderRegion = desktopWindow.locator('[data-panel-scale-id="folder-navigation"]');
  await expect(folderRegion).toBeVisible();
  await folderRegion.click({ position: { x: 40, y: 120 } });
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+=' : 'Control+=');

  await expect.poll(() => folderRegion.locator(':scope > div').first().evaluate((element) => ({
    height: (element as HTMLElement).style.height,
    width: (element as HTMLElement).style.width,
    zoom: (element as HTMLElement).style.zoom
  }))).toEqual({
    height: '95.2381%',
    width: '95.2381%',
    zoom: '1.05'
  });
  await expect(desktopWindow.getByText(/Folder navigation · 105%/)).toBeVisible();

  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/display-and-panel-scaling.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('display-and-panel-scaling', { path: screenshotPath });
});
