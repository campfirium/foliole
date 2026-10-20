import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/settings-sync-development-status.png'
);

test('opens Sync settings without an obsolete development warning', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'Sync');

  await expect(dialog.getByRole('heading', { level: 2, name: /^(Sync|同步)$/ })).toBeVisible();
  await expect(dialog.getByText(/^(In development · Not yet available|开发中 · 暂不可用)$/)).toHaveCount(0);
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-sync-development-status', {
    body: screenshot,
    contentType: 'image/png'
  });
});
