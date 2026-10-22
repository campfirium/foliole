// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { FRAMED_SYNC_INVENTORY_LOOKUP_INDEXES, FRAMED_SYNC_INVENTORY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

const T = '2026-10-16T00:00:00.000Z';
const LOOKUP_INDEX_NAMES = [...FRAMED_SYNC_INVENTORY_LOOKUP_INDEXES, 'idx_sync_topic_daily_owner_lookup']
  .map((sql) => /idx_\w+/u.exec(sql)![0]);
/** The node child lookup as the triggers ran it before the lookup indexes. */
const PREVIOUS_TRIGGERS = FRAMED_SYNC_INVENTORY_TRIGGERS.map((sql) =>
  sql.replaceAll('substr(object_id, 12) = +state.object_id', 'substr(object_id, 12) = state.object_id'));

function triggerName(sql: string) {
  return /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)![1];
}

async function openLibrary(companion: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-inventory-lookups-'));
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

/** Puts back the triggers and the single-column owner index of a library from before the lookup migration. */
function restorePreviousLookups(sqlite: Database.Database, companion: boolean) {
  for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) sqlite.exec(`DROP TRIGGER ${triggerName(sql)}`);
  for (const name of LOOKUP_INDEX_NAMES) sqlite.exec(`DROP INDEX ${name}`);
  sqlite.exec(`CREATE INDEX idx_sync_topic_daily_owner ON sync_object_state(substr(object_id, 12))
    WHERE object_type = 'topic_daily_count'`);
  for (const sql of PREVIOUS_TRIGGERS) sqlite.exec(sql);
  sqlite.pragma(`user_version = ${companion ? 95 : 167}`);
}

function writeDailyCount(sqlite: Database.Database, day: string) {
  sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, current_version_id,
    content_hash, last_modified_by_host_name, updated_at, deleted_at)
    VALUES ('topic_daily_count', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), NULL, ?,
      'mobile', ?, ?)`).run(`${day}:topic`, `h-${day}`, T, T);
}

async function writeHistory(library: Awaited<ReturnType<typeof openLibrary>>, step: number) {
  const base = textBranch('base', 'Original', undefined, T);
  const head = textBranch('head', 'Revised', base, T);
  await applyConvergentSyncNodesWithDbPort(library.db, step === 0 ? [base] : [base, head]);
  writeDailyCount(library.sqlite, `2026-10-1${step}`);
}

function schemaObjects(sqlite: Database.Database) {
  return sqlite.prepare(`SELECT type, name, sql FROM sqlite_master WHERE type IN ('index', 'trigger')
    AND sql IS NOT NULL ORDER BY name`).all();
}

it.each([false, true])('an upgraded library keeps the same inventory and lookups as a new one, companion=%s',
  async (companion) => {
    const created = await openLibrary(companion);
    const upgraded = await openLibrary(companion);
    try {
      restorePreviousLookups(upgraded.sqlite, companion);
      for (const library of [created, upgraded]) await writeHistory(library, 0);
      const before = await readFramedSyncInventory(upgraded.db);
      expect(before.find((entry) => entry.globalId === 'topic')?.stateFactIds).toHaveLength(1);
      await upgraded.upgrade();
      expect(await readFramedSyncInventory(upgraded.db)).toEqual(before);
      expect(schemaObjects(upgraded.sqlite)).toEqual(schemaObjects(created.sqlite));
      expect(upgraded.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_sync_topic_daily_owner'")
        .get()).toBeUndefined();
      for (const library of [created, upgraded]) await writeHistory(library, 1);
      const after = await readFramedSyncInventory(upgraded.db);
      expect(after).toEqual(await readFramedSyncInventory(created.db));
      expect(after.find((entry) => entry.globalId === 'topic')?.stateFactIds).toHaveLength(2);
    } finally {
      created.close();
      upgraded.close();
    }
  });
