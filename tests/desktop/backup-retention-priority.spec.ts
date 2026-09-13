import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const ARTIFACT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/backup-retention-priority.png'
);

test('shows live retention counts and persists drag priority', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openBackupsSection(desktopWindow);
  const rules = dialog.getByRole('region', { name: /^(Backup settings section|备份规则设置区)$/ });
  await rules.scrollIntoViewIfNeeded();

  await expect(rules.getByText(/^(Current|现有)$/)).toBeVisible();
  await expect(rules.getByText(/^(Set|设置)$/)).toBeVisible();
  await expect(rules.getByText(/^(Safety snapshots kept|保留安全快照数)$/)).toBeVisible();
  await expect(rules.getByText(/including manual backups|包括手动备份/)).toBeVisible();

  const monthlyHandle = rules.locator('[data-retention-tier="monthly"] button[draggable="true"]');
  const hourlyRow = rules.locator('[data-retention-tier="hourly"]');
  await monthlyHandle.dragTo(hourlyRow);
  await expect.poll(() => loadPriority(desktopWindow)).toEqual(['monthly', 'hourly', 'daily', 'weekly']);

  await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  await rules.screenshot({ path: ARTIFACT_PATH });
  await testInfo.attach('backup-retention-priority', { contentType: 'image/png', path: ARTIFACT_PATH });

  await rules.getByRole('button', { name: /^(Reset|重置)$/ }).click();
  await expect.poll(() => loadPriority(desktopWindow)).toEqual(['hourly', 'daily', 'weekly', 'monthly']);
});

async function loadPriority(desktopWindow: Parameters<typeof openBackupsSection>[0]) {
  return desktopWindow.evaluate(async () => {
    const settings = await window.electronAPI.invoke('load_backup_settings') as {
      retention_priority: string[];
    };
    return settings.retention_priority;
  });
}
