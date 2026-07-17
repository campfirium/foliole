import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { waitForDesktopAppReady } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EVIDENCE_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');

// SKIP: macOS-only native host acceptance | 2026-07-17 | revive: run on a darwin host
test.skip(process.platform !== 'darwin', 'macOS host acceptance');

test('reopens the main window in the existing process after the last window closes', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const initialWindow = await desktopSession.electronApp.browserWindow(desktopWindow);
  const closed = desktopWindow.waitForEvent('close');
  await initialWindow.evaluate((target) => target.close());
  await closed;

  await expect.poll(() => desktopSession.electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length)).toBe(0);
  expect(desktopSession.electronApp.process().exitCode).toBeNull();

  const reopenedWindowPromise = desktopSession.electronApp.waitForEvent('window');
  await desktopSession.electronApp.evaluate(({ app }) => {
    app.emit('activate');
  });
  const reopenedPage = await reopenedWindowPromise;
  await reopenedPage.setViewportSize({ width: 1600, height: 1000 });
  const reopenedReady = await waitForDesktopAppReady(reopenedPage, desktopSession.timeoutMs);

  await expectWorkspaceShell(reopenedPage);
  expect(reopenedReady.reported).toBe(true);
  expect(await reopenedPage.evaluate(() => typeof window.electronAPI?.invoke)).toBe('function');
  expect(await reopenedPage.evaluate(() =>
    window.electronAPI?.invoke('window_is_maximized'))).toEqual(expect.any(Boolean));
  await expect.poll(() => desktopSession.electronApp.evaluate(({ BrowserWindow }) => ({
    count: BrowserWindow.getAllWindows().length,
    visible: BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
  }))).toEqual({ count: 1, visible: true });

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const screenshotPath = path.join(EVIDENCE_DIR, 'macos-window-reopened.png');
  await reopenedPage.screenshot({ path: screenshotPath });
  await testInfo.attach('macos-window-reopened', {
    body: JSON.stringify({ reopenedReady, screenshotPath }, null, 2),
    contentType: 'application/json'
  });
});
