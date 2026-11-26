// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';
import { flushDirtyNodeSyncVersions, hasPendingNodeSyncVersions } from './nodeSyncVersions.js';
import { installSqlScaleProbe, type SqlScaleProbe } from './sqlScaleProbe.testSupport.js';
import { findLoopFullScans } from './sqlScanPlan.testSupport.js';

const at = '2026-11-26T08:00:00.000Z';
let probe: SqlScaleProbe | null = null;

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-sync-drain-scan-'));
  // Installed before the library opens, so statements the driver caches are recorded too.
  probe = installSqlScaleProbe('setup');
  initializeDatabase();
  const { sqlite } = openDatabaseConnection();
  const insert = sqlite.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, NULL, 'topic', ?, 'Body', ?, ?)`);
  sqlite.transaction(() => { for (let i = 0; i < 40; i += 1) insert.run(`n${i}`, `n${i}`, at, at); })();
  await drainDirtyNodeSyncVersions();
});

afterEach(async () => {
  probe?.uninstall();
  probe = null;
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true });
});

/** Tables walked whole by any statement the step ran; walking a partial index reads only the rows it holds. */
function scannedTables(step: string) {
  const partial = new Set((openDatabaseConnection().sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND sql LIKE '% WHERE %'").all() as { name: string }[])
    .map(row => row.name));
  const walksWhole = (detail: string) => {
    const index = /^SCAN \S+ USING (?:COVERING )?INDEX (\S+)/u.exec(detail)?.[1];
    return detail.startsWith('SCAN ') && !(index && partial.has(index));
  };
  return [...probe!.records.get(step)?.values() ?? []].flatMap(record => findLoopFullScans(record)
    .filter(scan => scan.plan.some(walksWhole)).map(scan => scan.table));
}

it('settles a library with nothing pending without walking every node', async () => {
  probe!.setStep('idle drain');
  expect(await drainDirtyNodeSyncVersions('foreground')).toEqual([]);
  probe!.setStep('done');

  expect(probe!.records.get('idle drain')?.size).toBeGreaterThan(0);
  expect(scannedTables('idle drain')).not.toContain('nodes');
});

// The sync round checks `hasPendingNodeSyncVersions` and then flushes; that pair is what repairs missing state.
it('still repairs a versioned node missing its sync state before the next sync round publishes', async () => {
  const { driver } = openDatabaseConnection();
  driver.execute("DELETE FROM sync_object_state WHERE object_type = 'node' AND object_id = 'n7'");

  expect(hasPendingNodeSyncVersions(driver)).toBe(true);
  expect(flushDirtyNodeSyncVersions()).toContain('n7');
  expect(driver.queryOne<{ object_id: string }>(
    "SELECT object_id FROM sync_object_state WHERE object_type = 'node' AND object_id = 'n7'"
  )).toEqual({ object_id: 'n7' });
  expect(hasPendingNodeSyncVersions(driver)).toBe(false);
});
