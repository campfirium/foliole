import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openBackupsSection } from './harness/settings';

const ARTIFACT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/backup-retention-priority.png'
);
const COMPACTION_ARTIFACT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/database-compaction.png'
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
  await expect.poll(() => loadPriority(desktopWindow)).toEqual(['daily', 'monthly', 'hourly', 'weekly']);

  await mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  await rules.screenshot({ path: ARTIFACT_PATH });
  await testInfo.attach('backup-retention-priority', { contentType: 'image/png', path: ARTIFACT_PATH });

  await rules.getByRole('button', { name: /^(Reset|重置)$/ }).click();
  await expect.poll(() => loadPriority(desktopWindow)).toEqual(['daily', 'hourly', 'weekly', 'monthly']);
});

test('shows database space and compacts only after the explicit action', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openBackupsSection(desktopWindow);
  const database = dialog.getByRole('region', { name: /^(Database maintenance section|数据库维护设置区)$/ });
  await database.scrollIntoViewIfNeeded();

  await expect(database.getByText(/(?:total|共).*(?:reclaimable|可回收)/)).toBeVisible();
  const compact = database.getByRole('button', { name: /^(Compact database|整理数据库)$/ });
  await compact.click();
  await expect(database.getByText(/^(Database compacted\.|数据库已整理。)$/)).toBeVisible();
  await expect(compact).toBeEnabled();

  await mkdir(path.dirname(COMPACTION_ARTIFACT_PATH), { recursive: true });
  await database.screenshot({ path: COMPACTION_ARTIFACT_PATH });
  await testInfo.attach('database-compaction', {
    contentType: 'image/png',
    path: COMPACTION_ARTIFACT_PATH
  });
});

async function loadPriority(desktopWindow: Parameters<typeof openBackupsSection>[0]) {
  return desktopWindow.evaluate(async () => {
    const settings = await window.electronAPI.invoke('load_backup_settings') as {
      retention_priority: string[];
    };
    return settings.retention_priority;
  });
}
