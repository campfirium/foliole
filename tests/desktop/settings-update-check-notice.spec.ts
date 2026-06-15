import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsDialog } from './harness/settings';

const ABOUT_CATEGORY = /^(About|关于)$/;
const CHECK_UPDATES = /^(Check for Updates|检查更新)$/;
const CURRENT_STATUS = /^(Up to date|已是最新)$/;
const RUNTIME_NOTICE = /^(Foliole is up to date\.|Foliole 已是最新。)$/;

test('settings update check uses the settings row instead of the runtime notice', async ({ desktopWindow }) => {
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
});
