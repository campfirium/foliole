import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const SCREENSHOT_PATH = path.join(
  process.cwd(), '.tmp/artifacts/desktop-acceptance/settings-sync-group.png'
);

test('creates a persistent Sync Group from desktop settings', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const settings = await openSettingsCategory(desktopWindow, 'Sync');
  const section = settings.getByLabel(/^(Sync section|同步设置区)$/);
  const create = section.getByRole('button', { name: /^(Create Sync Group|建立同步组)$/ });

  await expect(create).toBeEnabled();
  await create.click();
  await expect(section.getByRole('heading', { name: /^(Devices|设备)$/ })).toBeVisible();
  await expect(create).toHaveCount(0);

  const screenshot = await section.screenshot({ path: SCREENSHOT_PATH });
  await testInfo.attach('settings-sync-group', { body: screenshot, contentType: 'image/png' });
});
