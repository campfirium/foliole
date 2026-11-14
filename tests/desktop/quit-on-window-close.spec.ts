import { once } from 'node:events';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, normalizeDesktopWindow, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

const preferenceName = /^(Quit Foliole when closing the window|关闭窗口时退出 Foliole)$/;

// SKIP: native desktop window behavior | 2026-11-14 | revive: run on macOS or Windows
test.skip(process.platform !== 'darwin' && process.platform !== 'win32');

test('enabling quit on close exits the application after the setting is saved', async () => {
  const session = await launchDesktopSession();
  try {
    await normalizeDesktopWindow(session);
    const page = session.firstWindow;
    const dialog = await openSettingsCategory(page, 'General');
    const preference = dialog.getByRole('switch', { name: preferenceName });
    await expect(preference).not.toBeChecked();
    await preference.click();
    await expect(preference).toBeChecked();

    const process = session.electronApp.process();
    const exited = once(process, 'exit');
    const nativeWindow = await session.electronApp.browserWindow(page);
    await nativeWindow.evaluate((window) => window.close()).catch((error: unknown) => {
      if (!/closed/i.test(String(error))) throw error;
    });
    const [code] = await exited;
    expect(code).toBe(0);
  } finally {
    await session.close();
  }
});
