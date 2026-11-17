// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { framedSyncNodeInventorySql } from '../../lib/core/database/framedSyncInventoryProjectionSql.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { moveCanonicalNodeHistory } from '../../lib/core/sync/canonicalNodeHistory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';
import { textBranch } from './topicTextState.testSupport.js';

const T = '2026-10-24T00:00:00.000Z';

/** The inventory triggers `nodes` carried up to schema 169 and companion 96. */
const RETIRED_NODE_TRIGGERS = ['INSERT', 'UPDATE', 'DELETE'].map((action) => {
  const refs = action === 'INSERT' ? ['NEW'] : action === 'DELETE' ? ['OLD'] : ['OLD', 'NEW'];
  return `CREATE TRIGGER trg_framed_inventory_nodes_${action.toLowerCase()} AFTER ${action} ON nodes BEGIN
    ${refs.map((ref) => framedSyncNodeInventorySql(`${ref}.id`)).join('\n')} END`;
});

async function openLibrary(companion: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-inventory-node-triggers-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  const db = createBetterSqliteDbPort(sqlite);
  const upgrade = async (beforeVersionCommit?: () => void) => {
    const options = beforeVersionCommit ? { beforeVersionCommit } : {};
    if (companion) {
      await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: 'mobile', now: T, ...options });
    } else initializeDatabaseSchema(sqlite, options);
  };
  await upgrade();
  return { sqlite, db, upgrade, close: () => { sqlite.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

function nodeTriggers(sqlite: Database.Database) {
  return sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'
    AND name LIKE 'trg_framed_inventory_nodes_%'`).pluck().all();
}

function schemaObjects(sqlite: Database.Database) {
  return sqlite.prepare(`SELECT type, name, sql FROM sqlite_master WHERE type IN ('index', 'trigger')
    AND sql IS NOT NULL ORDER BY name`).all();
}

async function writeHistory(library: Awaited<ReturnType<typeof openLibrary>>, step: number) {
  const base = textBranch('base', 'Original', undefined, T);
  const head = textBranch('head', 'Revised', base, T);
  await applyConvergentSyncNodesWithDbPort(library.db, step === 0 ? [base] : [base, head]);
}

it.each([false, true])('an upgraded library drops the node inventory triggers and keeps its inventory, companion=%s',
  async (companion) => {
    const created = await openLibrary(companion);
    const upgraded = await openLibrary(companion);
    try {
      expect(nodeTriggers(created.sqlite)).toEqual([]);
      for (const sql of RETIRED_NODE_TRIGGERS) upgraded.sqlite.exec(sql);
      restoreEmptyLegacyDailyFlowSchema(upgraded.sqlite);
      upgraded.sqlite.pragma(`user_version = ${companion ? 96 : 169}`);
      for (const library of [created, upgraded]) await writeHistory(library, 0);
      const before = await readFramedSyncInventory(upgraded.db);
      expect(before.length).toBeGreaterThan(0);
      await upgraded.upgrade();
      expect(nodeTriggers(upgraded.sqlite)).toEqual([]);
      expect(schemaObjects(upgraded.sqlite)).toEqual(schemaObjects(created.sqlite));
      expect(await readFramedSyncInventory(upgraded.db)).toEqual(before);
      for (const library of [created, upgraded]) await writeHistory(library, 1);
      expect(await readFramedSyncInventory(upgraded.db)).toEqual(await readFramedSyncInventory(created.db));
    } finally {
      created.close();
      upgraded.close();
    }
  });

const HISTORY_UPDATE_NAMES = ['node_sync_versions', 'node_sync_tombstones']
  .map(table => `trg_framed_inventory_${table}_update`);

function installPreviousHistoryUpdates(sqlite: Database.Database) {
  const definition = sqlite.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').pluck();
  for (const name of HISTORY_UPDATE_NAMES) {
    const previous = String(definition.get(name)).replace(/ WHEN NOT \([^)]*\)/u, '');
    sqlite.exec(`DROP TRIGGER ${name}_same_key; DROP TRIGGER ${name}; ${previous}`);
  }
}

function watchHistoryInventoryRebuilds(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE inventory_removals (object_id TEXT);
    CREATE TRIGGER note_inventory_removal AFTER DELETE ON framed_sync_inventory
      WHEN OLD.object_type = 'node' BEGIN
        INSERT INTO inventory_removals VALUES (OLD.object_id);
      END`);
  return () => sqlite.prepare('SELECT object_id FROM inventory_removals').pluck().all();
}

function stripHistoryVersion(sqlite: Database.Database) {
  sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.body_deleted', json('true')) WHERE version_id = 'base'`);
}

async function updateTombstone(library: Awaited<ReturnType<typeof openLibrary>>, removals: () => unknown[]) {
  const { sqlite, db } = library;
  sqlite.exec(`INSERT INTO node_sync_tombstones
    (node_id, version_id, host_name, content_hash, snapshot_json, deleted_at, created_at)
    VALUES ('topic', 'old-deletion', 'remote', 'deleted-hash', '{}', '${T}', '${T}');
    UPDATE sync_object_state SET current_version_id = NULL, content_hash = 'deleted-hash', deleted_at = '${T}'
      WHERE object_type = 'node' AND object_id = 'topic';
    DELETE FROM inventory_removals;
    UPDATE node_sync_tombstones SET snapshot_json = '{"compact_version_history":true}' WHERE node_id = 'topic';`);
  expect(removals()).toEqual(['topic']);
  sqlite.exec(`UPDATE node_sync_tombstones SET version_id = 'new-deletion' WHERE node_id = 'topic'`);
  expect(sqlite.prepare(`SELECT version_id FROM framed_sync_version_summary
    WHERE version_id IN ('old-deletion', 'new-deletion')`).pluck().all()).toEqual(['new-deletion']);
  expect((await readFramedSyncInventory(db)).find(entry => entry.globalId === 'topic'))
    .toMatchObject({ currentVersionId: 'new-deletion' });
}

async function moveHistoryVersion(library: Awaited<ReturnType<typeof openLibrary>>) {
  const { sqlite, db } = library;
  const destination = textBranch('other-head', 'Another topic', undefined, T);
  await applyConvergentSyncNodesWithDbPort(db, [
    { ...destination, object_id: 'other', snapshot: { ...destination.snapshot, id: 'other' } }
  ]);
  const owners = sqlite.prepare(`SELECT object_id FROM framed_sync_inventory
    WHERE object_type = 'node' AND 'base' IN (SELECT value FROM json_each(frontier_json))`).pluck();
  expect(owners.all()).toEqual(['topic']);
  await db.transaction(tx => moveCanonicalNodeHistory(tx, {
    sourceId: 'topic', canonicalId: 'other', versionIds: ['base']
  }));
  expect(owners.all()).toEqual(['other']);
}

it.each([false, true])('refreshes same-key history updates once across an upgrade, companion=%s', async companion => {
  const library = await openLibrary(companion);
  const { sqlite, db } = library;
  try {
    await writeHistory(library, 0);
    await writeHistory(library, 1);
    const before = await readFramedSyncInventory(db);
    installPreviousHistoryUpdates(sqlite);
    const previousVersion = companion ? 118 : 191;
    sqlite.pragma(`user_version = ${previousVersion}`);
    await expect(library.upgrade(() => { throw new Error('upgrade_interrupted'); })).rejects.toThrow('upgrade_interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(previousVersion);
    const removals = watchHistoryInventoryRebuilds(sqlite);
    sqlite.exec('SAVEPOINT legacy_update');
    stripHistoryVersion(sqlite);
    expect(removals()).toEqual(['topic', 'topic']);
    sqlite.exec('ROLLBACK TO legacy_update; RELEASE legacy_update');

    await library.upgrade();
    expect(await readFramedSyncInventory(db)).toEqual(before);
    stripHistoryVersion(sqlite);
    expect(removals()).toEqual(['topic']);
    expect(sqlite.prepare(`SELECT json_extract(content_hash, '$[2][0][5]') FROM framed_sync_inventory
      WHERE object_id = 'topic'`).pluck().get()).toBe('deleted');

    await updateTombstone(library, removals);
    await moveHistoryVersion(library);
  } finally { library.close(); }
});
