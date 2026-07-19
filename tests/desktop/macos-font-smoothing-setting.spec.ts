import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const EVIDENCE_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const FONT_SMOOTHING_NAME = /^(Font smoothing|字体平滑)$/;

async function readFontSmoothingOverride(page: Page) {
  return page.evaluate(() => document.documentElement.style.getPropertyValue('-webkit-font-smoothing'));
}

test('keeps the macOS font smoothing choice across a full relaunch', async ({ desktopSession }, testInfo) => {
  // SKIP: macOS-only renderer acceptance | 2026-07-19 | revive: run on a darwin host
  test.skip(process.platform !== 'darwin', 'macOS-only renderer setting');
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    const firstPage = desktopSession.firstWindow;
    await expectWorkspaceShell(firstPage);
    const firstSettings = await openSettingsCategory(firstPage, 'Appearance');
    const firstSwitch = firstSettings.getByRole('switch', { name: FONT_SMOOTHING_NAME });
    await expect(firstSwitch).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => readFontSmoothingOverride(firstPage)).toBe('antialiased');

    await firstSwitch.evaluate(async (button) => {
      const saved = new Promise<void>((resolve) => {
        window.addEventListener('foliole:runtime-app-settings-saved', () => resolve(), { once: true });
      });
      button.click();
      await saved;
    });
    await expect(firstSwitch).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => readFontSmoothingOverride(firstPage)).toBe('');
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const disabledPath = path.join(EVIDENCE_DIR, 'macos-font-smoothing-disabled.png');
    await firstPage.screenshot({ path: disabledPath });
    await testInfo.attach('macos-font-smoothing-disabled', { path: disabledPath });

    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({ env: desktopSession.launchOptions.env });
    await expectWorkspaceShell(secondSession.firstWindow);
    const restoredSettings = await openSettingsCategory(secondSession.firstWindow, 'Appearance');
    await expect(restoredSettings.getByRole('switch', { name: FONT_SMOOTHING_NAME }))
      .toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => readFontSmoothingOverride(secondSession!.firstWindow)).toBe('');
    const restoredPath = path.join(EVIDENCE_DIR, 'macos-font-smoothing-restored.png');
    await secondSession.firstWindow.screenshot({ path: restoredPath });
    await testInfo.attach('macos-font-smoothing-restored', { path: restoredPath });
  } finally {
    await secondSession?.close();
  }
});
