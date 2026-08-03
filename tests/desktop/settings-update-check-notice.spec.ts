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

test('shows shared skipped-version notes without another platform limited fix', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  const installedVersion = await desktopSession.electronApp.evaluate(({ app }) => app.getVersion());
  const nextMajor = (Number.parseInt(installedVersion.split('.')[0] ?? '0', 10) || 0) + 1;
  const latestVersion = `${nextMajor}.8.2`;
  const skippedVersion = `${nextMajor}.8.1`;
  await desktopWindow.evaluate(({ latestVersion, skippedVersion }) => {
    const catalog = {
      [latestVersion]: { notes: ['Improved', 'A final shared change.'], platformNotes: { macos: ['Fixed', 'A macOS fix.'] } },
      [skippedVersion]: { notes: ['New', 'A shared change from 0.8.1.'], platformNotes: { windows: ['Fixed', 'A Windows-only fix.'] } }
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/releases/update-manifest.json')) {
        return new Response(JSON.stringify({
          releases: [
            { platforms: ['macos'], url: `https://github.com/campfirium/foliole/releases/tag/v${latestVersion}`, version: latestVersion },
            { platforms: ['windows'], url: `https://github.com/campfirium/foliole/releases/tag/v${skippedVersion}`, version: skippedVersion }
          ],
          schemaVersion: 1
        }), { headers: { 'content-type': 'application/json' }, status: 200 });
      }
      if (url.includes('/releases/notes/')) {
        return new Response(JSON.stringify(catalog), { headers: { 'content-type': 'application/json' }, status: 200 });
      }
      return originalFetch(input, init);
    };
  }, { latestVersion, skippedVersion });
  await expectWorkspaceShell(desktopWindow);
  const settingsDialog = await openSettingsDialog(desktopWindow);
  await settingsDialog.getByRole('button', { name: ABOUT_CATEGORY }).click();
  await settingsDialog.getByRole('button', { name: CHECK_UPDATES }).click();

  const releaseNotesDialog = desktopWindow.getByRole('dialog', { name: /^(Update details|更新内容)$/ });
  await expect(releaseNotesDialog.getByText('A shared change from 0.8.1.')).toBeVisible();
  await expect(releaseNotesDialog.getByText('A macOS fix.')).toBeVisible();
  await expect(releaseNotesDialog.getByText('A Windows-only fix.')).toHaveCount(0);
  const screenshotPath = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance/platform-release-notes.png');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await releaseNotesDialog.screenshot({ path: screenshotPath });
  await testInfo.attach('platform-release-notes', { path: screenshotPath });
});
