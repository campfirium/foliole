// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { openDatabaseConnection } from './connection.js';
import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
import {
  mockedSyncPackBuilderAppDataDir, readPackRows, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';
import { buildNextDesktopSyncPackPage } from './syncPackPageSelection.js';
import { backfillMissingTombstoneSyncState } from './syncPackTombstoneStateBackfill.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

setupSyncPackBuilderTestLifecycle();

function packInput(name: string, fromStateSeq: number) {
  return { fromPeerId: 'source', fromStateSeq, outputPath: resolveSyncPackPath(name),
    packId: name, toPeerId: 'target' };
}

it('assigns old orphan deletions durable positions and includes each in one bounded page', async () => {
  const { driver } = openDatabaseConnection();
  const deletedAt = '2026-09-28T00:00:00.000Z';
  for (let index = 0; index < 6; index++) {
    const nodeId = `deleted-${index}`;
    driver.execute(`INSERT INTO node_sync_tombstones (
      node_id, version_id, parent_version_id, host_name, content_hash,
      snapshot_json, deleted_at, created_at
    ) VALUES (?, ?, NULL, 'source', ?, ?, ?, ?)`, [nodeId, `v-${index}`,
      `hash-${index}`, JSON.stringify({ id: nodeId, deleted_at: deletedAt,
        filler: 'x'.repeat(3000) }), deletedAt, deletedAt]);
  }
  expect(backfillMissingTombstoneSyncState(driver)).toBe(6);
  expect(backfillMissingTombstoneSyncState(driver)).toBe(0);
  const one = await buildDesktopSyncPackFromDriver({ ...packInput('one.zip', 0),
    toStateSeq: 1, pageBudget: { applyRows: 100, databaseBytes: 1024 * 1024,
      transferBytes: 1024 * 1024 } }, driver);
  const budget = { ...one.measured, databaseBytes: one.measured.databaseBytes + 8192,
    transferBytes: one.measured.transferBytes + 8192 };
  const seen = new Set<string>();
  let cursor = 0;
  while (cursor < 6) {
    const page = await buildNextDesktopSyncPackPage(packInput(`page-${cursor}.zip`, cursor),
      budget, driver);
    expect(page.toStateSeq).toBeGreaterThan(cursor);
    expect(page.measured.applyRows).toBeLessThanOrEqual(budget.applyRows);
    const tombstones = readPackRows(page.outputPath).nodeTombstones as { node_id: string }[];
    for (const row of tombstones) {
      expect(seen.has(row.node_id)).toBe(false);
      seen.add(row.node_id);
    }
    cursor = page.toStateSeq;
  }
  expect(seen.size).toBe(6);
});

it('backfills old node states in fixed batches without retaining page-only IDs', () => {
  const { sqlite, driver } = openDatabaseConnection();
  const insert = sqlite.transaction(() => {
    for (let index = 0; index < 260; index++) {
      sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, current_version_id,
        created_at, updated_at) VALUES (?, 'topic', 'Title', '', ?, 'now', 'now')`)
        .run(`node-${index}`, `version-${index}`);
      sqlite.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name,
        created_at, content_hash, snapshot_json) VALUES (?, ?, 'source', 'now', 'hash', '{}')`)
        .run(`version-${index}`, `node-${index}`);
    }
  });
  insert();
  expect(backfillMissingNodeSyncState(driver, false)).toEqual([]);
  expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM sync_object_state
    WHERE object_type = 'node'`).get()).toMatchObject({ count: 260 });
  expect(backfillMissingNodeSyncState(driver)).toEqual([]);
});
