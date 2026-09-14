import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

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
const COMPACTION_IN_PROGRESS_ARTIFACT_PATH = path.join(
  process.cwd(),
  '.tmp/artifacts/desktop-acceptance/database-compaction-in-progress.png'
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

test('keeps the database page responsive while compacting a large library', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await createLargeReclaimableDatabase(desktopApp);
  const dialog = await openBackupsSection(desktopWindow);
  const database = dialog.getByRole('region', { name: /^(Database maintenance section|数据库维护设置区)$/ });
  await database.scrollIntoViewIfNeeded();

  await expect(database.getByText(/(?:total|共).*(?:reclaimable|可回收)/)).toBeVisible();
  const compact = database.getByRole('button', { name: /^(Compact database|整理数据库)$/ });
  await startMainProcessHeartbeat(desktopWindow);
  await compact.click();
  await expect(database.getByRole('button', { name: /^(Compacting\.\.\.|正在整理\.\.\.)$/ })).toBeVisible();
  await expect(database).toBeVisible();

  await mkdir(path.dirname(COMPACTION_IN_PROGRESS_ARTIFACT_PATH), { recursive: true });
  await database.screenshot({ path: COMPACTION_IN_PROGRESS_ARTIFACT_PATH });
  await testInfo.attach('database-compaction-in-progress', {
    contentType: 'image/png',
    path: COMPACTION_IN_PROGRESS_ARTIFACT_PATH
  });

  await expect(database.getByText(/^(Database compacted\.|数据库已整理。)$/)).toBeVisible();
  await expect(compact).toBeEnabled();
  const heartbeat = await stopMainProcessHeartbeat(desktopWindow);
  expect(heartbeat.samples).toBeGreaterThan(2);
  expect(heartbeat.maxLatencyMs).toBeLessThan(1_000);

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

async function createLargeReclaimableDatabase(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ app }) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    const cryptoApi = process.getBuiltinModule('node:crypto');
    if (!pathApi || !moduleApi || !cryptoApi) throw new Error('Node built-ins unavailable.');
    const loadModule = moduleApi.createRequire(pathApi.join(app.getAppPath(), 'main.js'));
    const connection = loadModule(pathApi.join(app.getAppPath(), 'database', 'connection.js')) as {
      openDatabaseConnection: () => { sqlite: import('better-sqlite3').Database };
    };
    const sqlite = connection.openDatabaseConnection().sqlite;
    sqlite.exec('CREATE TABLE compaction_acceptance_fixture (id INTEGER PRIMARY KEY, payload BLOB NOT NULL)');
    const insert = sqlite.prepare('INSERT INTO compaction_acceptance_fixture(payload) VALUES (?)');
    sqlite.transaction(() => {
      for (let index = 0; index < 12_288; index += 1) insert.run(cryptoApi.randomBytes(8_192));
    })();
    sqlite.prepare('DELETE FROM compaction_acceptance_fixture WHERE id > 6144').run();
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
  });
}

type CompactionHeartbeat = {
  active: boolean;
  latencies: number[];
};

async function startMainProcessHeartbeat(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    const state = globalThis as typeof globalThis & { __compactionHeartbeat?: CompactionHeartbeat };
    const heartbeat = { active: true, latencies: [] } satisfies CompactionHeartbeat;
    state.__compactionHeartbeat = heartbeat;
    void (async () => {
      while (heartbeat.active) {
        const startedAt = performance.now();
        await window.electronAPI.invoke('app_get_version');
        heartbeat.latencies.push(performance.now() - startedAt);
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      }
    })();
  });
}

async function stopMainProcessHeartbeat(desktopWindow: Page) {
  return desktopWindow.evaluate(async () => {
    const state = globalThis as typeof globalThis & { __compactionHeartbeat?: CompactionHeartbeat };
    const heartbeat = state.__compactionHeartbeat;
    if (!heartbeat) throw new Error('Missing database compaction heartbeat.');
    heartbeat.active = false;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    return {
      maxLatencyMs: Math.max(...heartbeat.latencies),
      samples: heartbeat.latencies.length
    };
  });
}
