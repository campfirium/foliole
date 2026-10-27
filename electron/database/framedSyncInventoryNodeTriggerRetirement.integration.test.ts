// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { framedSyncNodeInventorySql } from '../../lib/core/database/framedSyncInventoryProjectionSql.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
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
  const upgrade = async () => {
    if (companion) {
      await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: 'mobile', now: T });
    } else initializeDatabaseSchema(sqlite);
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
