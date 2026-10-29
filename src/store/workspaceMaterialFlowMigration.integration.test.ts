// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract';
import { act, node, now, open, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it.each(['desktop', 'companion'] as const)('upgrades installed %s triggers atomically, preserving facts, rows and preexisting invalidation', async host => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  await act(peer, await open(peer), 'read');
  await open(peer);
  const oldVersion = host === 'desktop' ? 182 : 110;
  const nextVersion = host === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION;
  for (const table of ['nodes', 'node_review', 'node_reading']) for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
    const name = `daily_flow_${table}_${event.toLowerCase()}`;
    peer.db.exec(`DROP TRIGGER IF EXISTS ${name}; CREATE TRIGGER ${name} AFTER ${event} ON ${table}
      BEGIN UPDATE daily_flow_state SET invalidated=1 WHERE id=1; END`);
  }
  peer.db.pragma(`user_version=${oldVersion}`);
  peer.db.exec('UPDATE daily_flow_state SET invalidated=1');
  const tables = ['nodes', 'node_reading', 'node_review', 'daily_flow_state', 'daily_flow_entries',
    'daily_flow_operations', 'daily_flow_sync_facts', 'daily_flow_fact_rows', 'daily_flow_projection_facts'];
  const facts = () => tables.map(table => peer.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const before = facts();
  const triggers = () => peer.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'daily_flow_%' ORDER BY name").all();
  const oldTriggers = triggers();
  const migrate = async (fail: boolean) => {
    const interrupt = () => { if (fail) throw new Error('interrupted'); };
    if (host === 'desktop') initializeDatabaseSchema(peer.db, { beforeVersionCommit: interrupt });
    else await peer.port.transaction(tx => migrateCompanionDatabase(tx, oldVersion, nextVersion, interrupt));
  };
  await expect(migrate(true)).rejects.toThrow('interrupted');
  expect(peer.db.pragma('user_version', { simple: true })).toBe(oldVersion);
  expect(triggers()).toEqual(oldTriggers);
  expect(facts()).toEqual(before);
  await migrate(false);
  expect(peer.db.pragma('user_version', { simple: true })).toBe(nextVersion);
  expect(facts()).toEqual(before);
  // Pending work is not forcibly cleared by the migration; normal service preparation owns it.
  await open(peer);
  const rows = await readCycleRows(peer.port);
  const session = (await readDailyFlow(peer.port))!.session;
  peer.db.prepare("UPDATE nodes SET content='Upgraded body', title=title, parent_id=parent_id WHERE id='b'").run();
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  expect(await open(peer)).toEqual(session);
  peer.db.prepare('UPDATE node_reading SET state=state').run();
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);
  peer.db.prepare('UPDATE node_reading SET next_at=?').run(now);
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(1);
});
