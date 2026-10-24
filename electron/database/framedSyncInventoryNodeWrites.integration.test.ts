// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-inventory-node-writes';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { framedSyncNodeInventorySql } from '../../lib/core/database/framedSyncInventoryProjectionSql.js';
import { flushRequestSyncInventoryDigests } from '../../lib/core/sync/framedSyncInventoryDigest.js';
import { inventoryColumns, inventoryEntryFromRow, type InventoryRow } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { seedNode } from './nodeMutations.test.helpers.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';
import { restoreNodesWithParents, softDeleteNodesWithParents } from './nodeTrashTransitions.js';

const childIds = Array.from({ length: 24 }, (_, index) => `child-${index}`);
const deletedAt = '2026-10-24T12:00:00.000Z';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-inventory-node-writes-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  seedNode('root', null, 0);
  childIds.forEach((nodeId, index) => seedNode(nodeId, 'root', index));
  await drainDirtyNodeSyncVersions();
});

afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5 });
});

function sqlite() {
  return openDatabaseConnection().sqlite;
}

function storedInventory() {
  return sqlite().prepare('SELECT * FROM framed_sync_inventory ORDER BY object_type, object_id').all();
}

/** The inventory a from-scratch projection of the current sync state produces; nothing is kept. */
function rebuiltInventory() {
  sqlite().exec('SAVEPOINT inventory_rebuild');
  try {
    sqlite().exec(framedSyncNodeInventorySql("SELECT object_id FROM sync_object_state WHERE object_type = 'node'"));
    return storedInventory();
  } finally {
    sqlite().exec('ROLLBACK TO inventory_rebuild; RELEASE inventory_rebuild');
  }
}

function cachedDigests() {
  return new Map((sqlite().prepare('SELECT object_id, shared_state_hash FROM framed_sync_node_digest').all() as
    { object_id: string; shared_state_hash: string }[]).map((row) => [row.object_id, row.shared_state_hash]));
}

function currentDigests() {
  const rows = sqlite().prepare(`SELECT ${inventoryColumns} FROM framed_sync_inventory inventory
    WHERE object_type = 'node'`).all() as InventoryRow[];
  return new Map(rows.map(inventoryEntryFromRow).map((entry) => [entry.globalId, bytesToHex(entry.sharedStateHash)]));
}

/** Stored inventory matches its projection and every digest still cached describes the current inventory. */
function expectInventoryCurrent() {
  expect(storedInventory()).toEqual(rebuiltInventory());
  const current = currentDigests();
  for (const [objectId, hash] of cachedDigests()) expect([objectId, current.get(objectId)]).toEqual([objectId, hash]);
}

async function flushDigests() {
  await flushRequestSyncInventoryDigests(createBetterSqliteDbPort(sqlite()));
  expect(cachedDigests()).toEqual(currentDigests());
}

it('keeps the sync inventory equal to its projection through a Trash move, version drain and restore', async () => {
  expect(storedInventory().length).toBeGreaterThan(childIds.length);
  expectInventoryCurrent();
  await flushDigests();

  softDeleteNodesWithParents({ deletedAt, nodeIds: childIds });
  expectInventoryCurrent();
  await drainDirtyNodeSyncVersions();
  expectInventoryCurrent();
  expect(currentDigests().get('child-0')).not.toBe(undefined);
  await flushDigests();

  restoreNodesWithParents({ nodeIds: childIds });
  expectInventoryCurrent();
  await drainDirtyNodeSyncVersions();
  expectInventoryCurrent();
});

it('keeps cached sync digests while a Trash move has not yet changed any synced version', async () => {
  await flushDigests();
  const before = cachedDigests();

  softDeleteNodesWithParents({ deletedAt, nodeIds: childIds });

  expect(cachedDigests()).toEqual(before);
  await drainDirtyNodeSyncVersions();
  const after = cachedDigests();
  for (const nodeId of childIds) expect(after.has(nodeId)).toBe(false);
  expectInventoryCurrent();
});
