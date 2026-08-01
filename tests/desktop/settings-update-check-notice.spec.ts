import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const ABOUT_CATEGORY = /^(About|关于)$/;
const CHECK_UPDATES = /^(Check for Updates|检查更新)$/;
const CURRENT_STATUS = /^(Up to date|已是最新)$/;
const RUNTIME_NOTICE = /^(Foliole is up to date\.|Foliole 已是最新。)$/;
const UPDATE_AVAILABLE = /^(Update available|有可用更新)$/;
const UPDATE_PREPARING = /^(Preparing update|正在准备更新)$/;

test('settings update check uses the settings row instead of the runtime notice', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/releases/update-manifest.json')) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          channel: 'beta',
          checkPolicy: { failureRetryMinutes: 15, intervalMinutes: 60 },
          releases: [
            {
              platforms: ['windows'],
              url: 'https://github.com/campfirium/foliole/releases/tag/v0.6.4',
              version: '0.6.4'
            }
          ]
        }), { headers: { 'content-type': 'application/json' }, status: 200 });
      }
      return originalFetch(input, init);
    };
  });
  await expectWorkspaceShell(desktopWindow);

  const settingsDialog = await openSettingsDialog(desktopWindow);
  await settingsDialog.getByRole('button', { name: ABOUT_CATEGORY }).click();
  await settingsDialog.getByRole('button', { name: CHECK_UPDATES }).click();

  await expect(settingsDialog.getByText(CURRENT_STATUS)).toBeVisible();
  await expect(desktopWindow.getByTestId('app-runtime-notice')).toHaveCount(0);
  await expect(desktopWindow.getByText(RUNTIME_NOTICE)).toHaveCount(0);
  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/settings-update-check.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await settingsDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('settings-update-check', { path: screenshotPath });
});

test('keeps retry waiting and terminal native failure distinct from update success', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-update-check-state', JSON.stringify({
    cachedManifest: null,
    cachedReleaseNotes: null,
    dismissedVersion: null,
    lastCheckedAt: '2026-08-01T00:00:00.000Z',
    lastCheckStatus: 'available',
    lastSeenVersion: '0.7.3',
    latestReleaseUrl: 'https://github.com/campfirium/foliole/releases/tag/v0.7.3',
    latestVersion: '0.7.3'
  })));
  const settingsDialog = await openSettingsDialog(desktopWindow);
  await settingsDialog.getByRole('button', { name: ABOUT_CATEGORY }).click();

  const sendState = (state: Record<string, unknown>) => desktopSession.electronApp.evaluate(
    ({ BrowserWindow }, payload) => BrowserWindow.getAllWindows()
      .find((window) => !window.isDestroyed())?.webContents.send('foliole:desktop-update-state', payload),
    state
  );
  await sendState({ errorCode: 'check-failed', phase: 'error', version: '0.7.3' });
  const availableStatus = settingsDialog.getByText(UPDATE_AVAILABLE, { exact: true });
  await expect(availableStatus).toBeVisible();
  await expect(availableStatus).toHaveClass(/text-foreground\/60/);
  await expect(availableStatus).not.toHaveClass(/text-emerald-700/);
  await expect(settingsDialog.getByRole('button', { name: CHECK_UPDATES })).toBeVisible();

  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/settings-update-terminal-neutral.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await settingsDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('settings-update-terminal-neutral', { path: screenshotPath });

  await sendState({ phase: 'pending-asset', version: '0.7.3' });
  await expect(settingsDialog.getByText(UPDATE_PREPARING, { exact: true })).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: CHECK_UPDATES })).toHaveCount(0);
});
