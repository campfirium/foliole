import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function facts(app: ElectronApplication) {
  return app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const Database = require('better-sqlite3');
      const db = new Database(connection.openDatabaseConnection().dbPath, { readonly: true, fileMustExist: true });
      try { return {
        sources: db.prepare("SELECT value FROM workspace_meta WHERE key GLOB 'foreground_time_source:*' ORDER BY key").pluck().all() as string[],
        saved: db.prepare('SELECT COALESCE(SUM(duration_ms),0) FROM foreground_daily_time').pluck().get() as number,
        rows: db.prepare('SELECT count(*) FROM foreground_daily_time').pluck().get() as number
      }; } finally { db.close(); }
    });
  });
}

async function total(page: Page) {
  return page.evaluate(async () => {
    const first = new Date(); first.setDate(first.getDate() - 1);
    const last = new Date(); last.setDate(last.getDate() + 2);
    const key = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const history = await window.electronAPI.invoke('load_foreground_time_history', { fromDay: key(first), toDay: key(last) });
    return history.days.reduce((sum: number, item: { durationMs: number }) => sum + item.durationMs, 0);
  });
}

async function focus(app: ElectronApplication, page: Page) {
  const target = await app.browserWindow(page);
  await target.evaluate(window => {
    window.show(); window.setAlwaysOnTop(true); window.focus(); window.webContents.focus(); window.setAlwaysOnTop(false);
  });
  await expect.poll(() => target.evaluate(window => window.isFocused())).toBe(true);
}

test('retains foreground duration after old-backup restore and application relaunch, without counting background gaps', async ({ desktopSession }, testInfo) => {
  expect(process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN).not.toBe('1');
  const { firstWindow: page, electronApp: app } = desktopSession;
  let reopened: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(page);
    const original = await facts(app);
    const backup = await page.evaluate(() => window.electronAPI.invoke('backup_sqlite_database', {}));
    await focus(app, page);
    const initial = await total(page);
    await expect.poll(async () => { await focus(app, page); return total(page); }).toBeGreaterThan(initial + 1_000);
    const target = await app.browserWindow(page);
    await target.evaluate(window => window.hide());
    await expect.poll(() => target.evaluate(window => window.isFocused())).toBe(false);
    await expect.poll(async () => (await facts(app)).saved).toBeGreaterThan(initial);
    const background = await total(page);
    await page.waitForTimeout(1_000);
    expect(await total(page)).toBe(background);
    await focus(app, page);
    await expect.poll(async () => { await focus(app, page); return total(page); }).toBeGreaterThan(background + 1_000);
    const beforeRestore = await total(page);
    await page.evaluate(sourcePath => window.electronAPI.invoke('restore_sqlite_database', { sourcePath }), backup.destinationPath);
    expect(await total(page)).toBeGreaterThanOrEqual(beforeRestore);
    const restored = await facts(app);
    expect(restored.sources).not.toEqual(original.sources);
    await target.evaluate(window => window.hide());
    await expect.poll(async () => (await facts(app)).saved).toBeGreaterThanOrEqual(beforeRestore);
    const settled = await facts(app);
    await app.close();
    reopened = await launchDesktopSession({ env: { ...process.env,
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot } });
    await expectWorkspaceShell(reopened.firstWindow);
    await focus(reopened.electronApp, reopened.firstWindow);
    const afterRestart = await facts(reopened.electronApp);
    expect(afterRestart.sources).toEqual(restored.sources);
    // Closing the app settles any final native focus-notification tail after the pre-close read.
    expect(afterRestart.saved).toBeGreaterThanOrEqual(settled.saved);
    expect(afterRestart.rows).toBe(settled.rows);
    await expect.poll(async () => {
      await focus(reopened!.electronApp, reopened!.firstWindow); return total(reopened!.firstWindow);
    }).toBeGreaterThan(settled.saved + 1_000);
    const calendarButton = reopened.firstWindow.getByRole('button', { name: /^(Open Review Statistics|打开复习统计)$/ });
    await calendarButton.click();
    await expect(reopened.firstWindow.getByRole('dialog', { name: /^(Review statistics|复习统计)$/ })).toBeVisible();
    await expect(reopened.firstWindow.getByRole('status', { name: /^(Total foreground time|累计前台时长)$/ })).toHaveText(/^(<1|[1-9]\d*)(m|分钟)$/);
    const directory = path.resolve('.tmp/artifacts/T338');
    await mkdir(directory, { recursive: true });
    await reopened.firstWindow.screenshot({ path: path.join(directory, 'foreground-time-calendar.png') });
    await testInfo.attach('foreground-time-persistence', { body: JSON.stringify({ original, restored, settled, afterRestart }), contentType: 'application/json' });
  } finally { await reopened?.close(); }
});
