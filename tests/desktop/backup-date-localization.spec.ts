import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const ARTIFACT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/backup-date-localization-zh-Hans.png'
);

test('formats backup dates in the active Chinese interface language', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-app-language', 'zh-Hans'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const dialog = await openBackupsSection(desktopWindow);
  const metadata = dialog.getByText(/^自动备份 · \d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2} · \d+ MB$/).first();
  await expect(metadata).toBeVisible();
  await expect(dialog.getByText(/Sept/)).toHaveCount(0);

  await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  await metadata.locator('xpath=../..').screenshot({ path: ARTIFACT_PATH });
  await testInfo.attach('backup-date-localization-zh-Hans', {
    contentType: 'image/png', path: ARTIFACT_PATH
  });
});
