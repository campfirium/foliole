// @vitest-environment node

import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { extractSyncPackDatabaseFromFile } from '../sync/syncPackContainerReader.js';

import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
import {
  resolveSyncPackPath,
  mockedSyncPackBuilderAppDataDir,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';
import { buildNextDesktopSyncPackPage } from './syncPackPageSelection.js';

setupSyncPackBuilderTestLifecycle();
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

function seedNodes(count: number) {
  const driver = openDatabaseConnection().driver;
  for (let seq = 1; seq <= count; seq++) {
    driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES (?, 'topic', ?, '', 'now', 'now')`, [`node-${seq}`, 'x'.repeat(3000 + seq)]);
    driver.execute(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
      content_hash, last_modified_by_host_name, updated_at, sync_dirty)
      VALUES ('node', ?, ?, ?, 'source', 'now', 0)`, [`node-${seq}`, seq, `hash-${seq}`]);
  }
  return driver;
}

function packInput(fileName: string, fromStateSeq: number, toStateSeq?: number) {
  return { createdAt: '2026-09-27T00:00:00.000Z', fromPeerId: 'source',
    fromStateSeq, outputPath: resolveSyncPackPath(fileName), packId: 'page-pack',
    toPeerId: 'target', ...(toStateSeq === undefined ? {} : { toStateSeq }) };
}

it('chooses real schema pages by transfer, database, and apply work budgets', async () => {
  const driver = seedNodes(12);
  const sample = await buildDesktopSyncPackFromDriver(packInput('sample.zip', 0, 4), driver);
  const full = await buildDesktopSyncPackFromDriver(packInput('full.zip', 0, 12), driver);
  expect(full.measured.databaseBytes).toBeGreaterThan(sample.measured.databaseBytes);
  expect(full.measured.applyRows).toBeGreaterThan(sample.measured.applyRows);
  const budget = sample.measured;
  const pages = [];
  let cursor = 0;
  while (cursor < 12) {
    const page = await buildNextDesktopSyncPackPage(packInput(`page-${pages.length}.zip`, cursor),
      budget, driver);
    expect(page.fromStateSeq).toBe(cursor);
    expect(page.toStateSeq).toBeGreaterThan(cursor);
    expect(page.toStateSeq).toBeLessThanOrEqual(12);
    expect(page.frontierStateSeq).toBe(12);
    expect(page.measured.databaseBytes).toBeLessThanOrEqual(budget.databaseBytes);
    expect(page.measured.transferBytes).toBeLessThanOrEqual(budget.transferBytes);
    expect(page.measured.applyRows).toBeLessThanOrEqual(budget.applyRows);
    pages.push(page);
    cursor = page.toStateSeq;
  }
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.at(-1)?.toStateSeq).toBe(12);
});

it('advances an empty scan to the fixed frontier and rejects an oversized first object', async () => {
  const driver = seedNodes(2);
  const single = await buildDesktopSyncPackFromDriver(packInput('one.zip', 0, 1), driver);
  await expect(buildNextDesktopSyncPackPage(packInput('too-small.zip', 0), {
    ...single.measured, applyRows: 1
  }, driver)).rejects.toThrow('sync_pack_object_requires_fragments');
  await expect(fs.stat(resolveSyncPackPath('too-small.zip'))).rejects.toMatchObject({ code: 'ENOENT' });
  driver.execute(`UPDATE sync_object_state SET state_seq = 3
    WHERE object_type = 'node' AND object_id = 'node-2'`);
  driver.execute('UPDATE sync_state_sequence SET high_water = 3 WHERE singleton_id = 1');
  const nextPageBudget = { ...single.measured,
    databaseBytes: single.measured.databaseBytes + 8192,
    transferBytes: single.measured.transferBytes + 8192 };
  const empty = await buildNextDesktopSyncPackPage({ ...packInput('empty.zip', 1),
    frontierStateSeq: 2 }, nextPageBudget, driver);
  expect(empty).toMatchObject({ fromStateSeq: 1, toStateSeq: 2, frontierStateSeq: 2,
    objectCount: 0 });
  const next = await buildNextDesktopSyncPackPage(packInput('next.zip', 2), nextPageBudget, driver);
  expect(next).toMatchObject({ fromStateSeq: 2, toStateSeq: 3, objectCount: 1 });
});

it('counts a future-sequence ancestor as a dependency without advancing the main scan', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('parent', NULL, 'folder', 'Parent', '', 'now', 'now'),
      ('child', 'parent', 'topic', 'Child', '', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'child', 1, 'child-hash', 'source', 'now'),
      ('node', 'parent', 3, 'parent-hash', 'source', 'now')`);
  driver.execute('UPDATE sync_state_sequence SET high_water = 3 WHERE singleton_id = 1');
  const baseline = await buildDesktopSyncPackFromDriver({ ...packInput('dependency-baseline.zip', 0, 1),
    frontierStateSeq: 1 }, driver);
  const page = await buildNextDesktopSyncPackPage({ ...packInput('dependency.zip', 0),
    frontierStateSeq: 1 }, baseline.measured, driver);
  expect(page.toStateSeq).toBe(1);
  const dbPath = resolveSyncPackPath('dependency.db');
  await extractSyncPackDatabaseFromFile({ archivePath: page.outputPath,
    expectedPeerId: 'target', expectedSourcePeerId: 'source', outputPath: dbPath });
  const incoming = new Database(dbPath, { readonly: true });
  try {
    expect(incoming.prepare('SELECT object_id, state_seq FROM sync_object_state ORDER BY state_seq').all())
      .toEqual([{ object_id: 'child', state_seq: 1 }, { object_id: 'parent', state_seq: 3 }]);
  } finally { incoming.close(); }
});

it('advances past a filtered source state without pretending it was delivered', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'special-inbox', 1, 'internal-hash', 'source', 'now')`);
  const baseline = await buildDesktopSyncPackFromDriver(packInput('filtered-baseline.zip', 0, 1), driver);
  const page = await buildNextDesktopSyncPackPage(packInput('filtered.zip', 0), baseline.measured, driver);
  expect(page).toMatchObject({ fromStateSeq: 0, toStateSeq: 1, objectCount: 0 });
});

it('stops an oversized version before selecting its body into the pack builder', async () => {
  const driver = seedNodes(1);
  const baseline = await buildDesktopSyncPackFromDriver(packInput('large-baseline.zip', 0, 1), driver);
  const body = 'B'.repeat(4 * 1024 * 1024);
  driver.execute("UPDATE nodes SET current_version_id = 'large-v1' WHERE id = 'node-1'");
  driver.execute(`INSERT INTO node_sync_versions
    (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('large-v1', 'node-1', 'source', 'now', 'hash', ?, ?)`,
  [body, JSON.stringify({ content: body })]);
  const queryOne = driver.queryOne.bind(driver);
  const spy = vi.spyOn(driver, 'queryOne').mockImplementation((sql, params) => {
    if (sql.includes('FROM node_sync_versions') && sql.includes('body_text') &&
        !sql.includes('length(CAST(body_text AS BLOB))')) {
      throw new Error('large_body_was_materialized');
    }
    return queryOne(sql, params);
  });
  try {
    await expect(buildNextDesktopSyncPackPage(packInput('large-refused.zip', 0),
      baseline.measured, driver)).rejects.toThrow('sync_pack_object_requires_fragments');
    await expect(fs.stat(resolveSyncPackPath('large-refused.zip')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  } finally { spy.mockRestore(); }
});
