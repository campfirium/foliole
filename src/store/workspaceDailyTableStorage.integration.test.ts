// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { dailyFlowFactHash } from '../../lib/core/flow/dailyFlowFactHash.js';
import { readDailyFlowFact } from '../../lib/core/flow/dailyFlowFactStorage.js';
import { readFramedSyncObjectStateInventory } from '../../lib/core/sync/framedSyncObjectStateInventory.js';
import { createLargeFlow, seedLargeFlowLibrary } from '../test/largeDailyFlowSync.testSupport.js';


const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function library(count: number) {
  const parent = path.resolve('.tmp/artifacts/T597');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'storage-')); roots.push(root);
  const file = path.join(root, 'library.db');
  const sqlite = new Database(file);
  initializeDatabaseSchema(sqlite); seedLargeFlowLibrary(sqlite, count);
  sqlite.close();
  return { file, created: await createLargeFlow(file) };
}

it('stores a complete 14241-member list as relational rows while keeping the operation header small', async () => {
  const { file, created } = await library(14_241);
  const db = new Database(file);
  try {
    const header = db.prepare('SELECT payload_json FROM daily_flow_sync_facts WHERE id=?').pluck().get(created.id) as string;
    expect(Buffer.byteLength(header)).toBeLessThan(5_000);
    expect(JSON.parse(header).rows).toEqual([]);
    expect(db.prepare("SELECT count(*) FROM daily_flow_fact_rows WHERE fact_id=? AND slot='rows'").pluck().get(created.id)).toBe(14_241);
    expect(db.prepare('SELECT complete,row_count FROM daily_flow_lists WHERE list_id=?').get(created.id))
      .toEqual({ complete: 1, row_count: 14_241 });
    expect(await readDailyFlowFact(createBetterSqliteDbPort(db), created.id)).toEqual(created.fact);
    expect(db.prepare('SELECT fact_id FROM daily_flow_projection_facts').all()).toEqual([{ fact_id: created.id }]);
  } finally { db.close(); }
  const reopened = new Database(file, { readonly: true });
  try { expect(await readDailyFlowFact(createBetterSqliteDbPort(reopened), created.id)).toEqual(created.fact); }
  finally { reopened.close(); }
});

it.each(['desktop', 'companion'])('converts old %s data losslessly and rolls back an interrupted upgrade', async host => {
  const { file, created } = await library(14_241);
  const db = new Database(file);
  const fact = structuredClone(created.fact);
  fact.rows.reverse();
  fact.removedNodeIds = ['second', 'first'];
  const meta = fact.session.cycle!;
  fact.session.cycle!.change = { source: { ...meta }, target: { ...meta },
    before: fact.rows.slice(0, 2), after: fact.rows.slice(2, 4).reverse() };
  const payload = JSON.stringify(fact);
  const hash = dailyFlowFactHash(fact);
  const previous = host === 'desktop' ? 178 : 106;
  try {
    db.exec('DROP TABLE daily_flow_projection_facts; DROP TABLE daily_flow_lists; DROP TABLE daily_flow_fact_rows');
    db.prepare('UPDATE daily_flow_sync_facts SET payload_json=? WHERE id=?').run(payload, fact.id);
    db.prepare("UPDATE sync_object_state SET content_hash=? WHERE object_type='daily_flow' AND object_id=?").run(hash, fact.id);
    db.pragma(`user_version=${previous}`);
    const original = db.prepare('SELECT id,content,created_at,updated_at FROM nodes ORDER BY id').all();
    const run = async (fail: boolean) => {
      const interrupt = () => { if (fail) throw new Error('interrupted'); };
      if (host === 'desktop') initializeDatabaseSchema(db, { beforeVersionCommit: interrupt });
      else await createBetterSqliteDbPort(db).transaction(tx => migrateCompanionDatabase(tx, 106, 107, interrupt));
    };
    await expect(run(true)).rejects.toThrow('interrupted');
    expect(db.pragma('user_version', { simple: true })).toBe(previous);
    expect(db.prepare('SELECT payload_json FROM daily_flow_sync_facts WHERE id=?').pluck().get(fact.id)).toBe(payload);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='daily_flow_fact_rows'").get()).toBeUndefined();
    await run(false);
    const restored = await readDailyFlowFact(createBetterSqliteDbPort(db), fact.id);
    expect(restored).toEqual(fact);
    expect(dailyFlowFactHash(restored!)).toBe(hash);
    expect(db.prepare('SELECT id,content,created_at,updated_at FROM nodes ORDER BY id').all()).toEqual(original);
    expect(Buffer.byteLength(db.prepare('SELECT payload_json FROM daily_flow_sync_facts WHERE id=?').pluck().get(fact.id) as string)).toBeLessThan(5_000);
  } finally { db.close(); }
});

it('keeps an orphan operation without claiming that its missing root was completely received', async () => {
  const { file, created } = await library(3);
  const db = new Database(file);
  try {
    const fact = { ...created.fact, id: 'orphan', rootId: 'missing-root', parentId: 'missing-parent', kind: 'advance' as const };
    const payload = JSON.stringify(fact);
    db.exec('DROP TABLE daily_flow_projection_facts; DROP TABLE daily_flow_lists; DROP TABLE daily_flow_fact_rows');
    db.prepare('UPDATE daily_flow_sync_facts SET payload_json=? WHERE id=?').run(created.payload_json, created.id);
    db.prepare(`INSERT INTO daily_flow_sync_facts(id,root_id,occurred_at,day_start,payload_json,day_end,parent_id,kind)
      VALUES(?,?,?,?,?,?,?,?)`).run(fact.id, fact.rootId, fact.occurredAt, fact.settings.dayWindow.start,
      payload, fact.settings.dayWindow.end, fact.parentId, fact.kind);
    db.prepare('UPDATE daily_flow_sync_projection SET root_id=?,head_id=?').run(fact.rootId, fact.id);
    db.prepare(`INSERT INTO sync_object_state(object_type,object_id,state_seq,content_hash,last_modified_by_host_name,updated_at,sync_dirty)
      VALUES('daily_flow',?,999,?,'local',?,1)`).run(fact.id, dailyFlowFactHash(fact), fact.occurredAt);
    db.pragma('user_version=178');
    initializeDatabaseSchema(db);
    expect(await readDailyFlowFact(createBetterSqliteDbPort(db), fact.id)).toEqual(fact);
    expect(db.prepare('SELECT count(*) FROM daily_flow_projection_facts').pluck().get()).toBe(0);
    const inventory = await readFramedSyncObjectStateInventory(createBetterSqliteDbPort(db));
    expect(inventory.find(entry => entry.globalId === fact.id)?.unready).toBe(true);
    expect(db.prepare('SELECT complete FROM daily_flow_lists WHERE list_id=?').get(fact.rootId)).toBeUndefined();
  } finally { db.close(); }
});
