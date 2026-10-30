import fs from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

// Hold the existing host status without running a migration or changing library data.
async function setUpgradeProgress(app: ElectronApplication, version: number | null) {
  await app.evaluate(async (_, value) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const status = require(`${process.cwd()}/dist/electron/database/databaseUpgradeStatus.js`);
    if (value === null) status.clearDatabaseUpgradeProgress();
    else status.reportDatabaseUpgradeProgress({ from: 1, to: 5, version: value });
  }, version);
}

test('startup waiting reveals feedback gradually and leaves errors immediately visible', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const evidenceDir = path.resolve('.tmp/artifacts/T666');
  await fs.mkdir(evidenceDir, { recursive: true });
  await setUpgradeProgress(desktopApp, 2);
  try {
    await desktopWindow.reload();
    const waiting = desktopWindow.locator('[data-startup-loading-phase]');
    await expect(waiting).toHaveAttribute('data-startup-loading-phase', 'spinner');
    await expect(waiting.getByRole('heading')).toHaveCount(0);
    await desktopWindow.screenshot({ path: path.join(evidenceDir, 'desktop-spinner.png') });
    await expect(waiting).toHaveAttribute('data-startup-loading-phase', 'details');
    await expect(waiting.getByRole('heading')).toBeVisible();
    await expect(waiting.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await desktopWindow.screenshot({ path: path.join(evidenceDir, 'desktop-upgrade.png') });
    await setUpgradeProgress(desktopApp, 4);
    await expect(waiting.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    await desktopWindow.setViewportSize({ width: 390, height: 844 });
    await desktopWindow.screenshot({ path: path.join(evidenceDir, 'narrow-upgrade.png') });
    await setUpgradeProgress(desktopApp, null);
    await expect(waiting).toHaveCount(0);
    await expectWorkspaceShell(desktopWindow);

    await setUpgradeProgress(desktopApp, 2);
    const errorUrl = new URL(desktopWindow.url());
    errorUrl.searchParams.set('startupView', 'startup-error');
    errorUrl.searchParams.set('startupError', 'Startup diagnostics remain available');
    await desktopWindow.goto(errorUrl.href);
    await expect(desktopWindow.getByRole('alert')).toContainText('Startup diagnostics remain available');
    await expect(waiting).toHaveCount(0);
    await desktopWindow.screenshot({ path: path.join(evidenceDir, 'startup-error.png') });
    await testInfo.attach('startup-upgrade', { path: path.join(evidenceDir, 'desktop-upgrade.png'), contentType: 'image/png' });
  } finally {
    await setUpgradeProgress(desktopApp, null);
  }
});
