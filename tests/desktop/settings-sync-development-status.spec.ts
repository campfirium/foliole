import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/settings-sync-development-status.png'
);

test('marks Sync as not yet available on its settings page', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'Sync');

  await expect(dialog.getByText(/^(In development · Not yet available|开发中 · 暂不可用)$/)).toBeVisible();
  await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });
  const screenshot = await dialog.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-sync-development-status', {
    body: screenshot,
    contentType: 'image/png'
  });
});
