import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import {
  createDesktopLaunchOptions,
  resolveDesktopAppRoot,
  resolveDesktopLaunchTarget
} from '../../scripts/desktop/playwright-desktop-harness.mjs';
import { createDesktopIsolationContext } from '../../scripts/desktop/playwright-desktop-isolation.mjs';

const SCREENSHOT_PATH = path.resolve(
  '.tmp',
  'artifacts',
  'desktop-acceptance',
  'initial-library-setup-hidden-native.png'
);

test('fresh macOS startup confirms the library before database creation', async ({ browserName }, testInfo) => {
  void browserName;
  // SKIP: macOS-only first-launch flow | 2026-07-16 | revive: run this acceptance on a macOS host
  test.skip(process.platform !== 'darwin', 'macOS-only first-launch flow');

  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-initial-library-'));
  const libraryHome = path.join(stateRoot, 'Documents', 'Foliole');
  const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot };
  const isolation = createDesktopIsolationContext(env, { persistedLibraryHome: libraryHome });
  const target = resolveDesktopLaunchTarget(resolveDesktopAppRoot(), fs.existsSync, env);
  const launchOptions = createDesktopLaunchOptions(target, 120_000, env, isolation);
  let electronApp = await electron.launch(launchOptions);

  try {
    let page = await electronApp.firstWindow({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /(Create Library|创建资料库)/ })).toBeVisible();
    expect(fs.existsSync(databasePath)).toBe(false);

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH });
    await testInfo.attach('initial-library-setup', { contentType: 'image/png', path: SCREENSHOT_PATH });

    await page.getByRole('button', { name: /^(Create|创建)$/ }).click();
    await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
      timeout: 60_000
    });
    const pointerPath = path.join(isolation.userDataPath, 'config', 'current-library.json');
    await expect.poll(() => fs.existsSync(pointerPath), { timeout: 10_000 }).toBe(true);
    expect(JSON.parse(fs.readFileSync(pointerPath, 'utf8')).library_home).toBe(libraryHome);
    await expect.poll(() => fs.existsSync(databasePath), { timeout: 10_000 }).toBe(true);

    await electronApp.close();
    electronApp = await electron.launch(launchOptions);
    page = await electronApp.firstWindow({ timeout: 30_000 });
    await page.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true, null, {
      timeout: 60_000
    });
    await expect(page.getByRole('heading', { name: /(Create Library|创建资料库)/ })).toHaveCount(0);
  } finally {
    await electronApp.close().catch(() => undefined);
    isolation.cleanup();
    fs.rmSync(stateRoot, { force: true, recursive: true });
  }
});
