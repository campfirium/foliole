import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';
import { applySyncPackGroupFactsWithDbPort } from '../../lib/core/sync/syncPackGroupFactsExecutor.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  seedGroup(sqlite, 'main', ['a', 'b']);
  sqlite.exec("INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'a', 'active', NULL, NULL, '2026-08-09T00:00:00Z')");
  sqlite.exec("ATTACH DATABASE ':memory:' AS inc");
  for (const statement of PACK_SCHEMA) sqlite.exec(statement.replace(/^CREATE TABLE /, 'CREATE TABLE inc.'));
});

afterEach(() => sqlite.close());

it('merges a third member approved by B when A rejoins the same timeline', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b', 'c']);
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });

  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }));

  expect(sqlite.prepare("SELECT approved_by_device_id FROM sync_group_members WHERE device_id = 'c'").get())
    .toEqual({ approved_by_device_id: 'b' });
});

it('accepts a current membership name update only from that Device', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b']);
  sqlite.exec(`UPDATE inc.sync_group_members SET device_name = 'B renamed',
    updated_at = '2026-08-11T00:00:00Z' WHERE device_id = 'b'`);
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });

  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }));

  expect(sqlite.prepare("SELECT device_name FROM sync_group_members WHERE device_id = 'b'").get())
    .toEqual({ device_name: 'B renamed' });

  sqlite.exec(`UPDATE inc.sync_group_members SET device_name = 'A forged',
    updated_at = '2026-08-12T00:00:00Z' WHERE device_id = 'a'`);
  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }));
  expect(sqlite.prepare("SELECT device_name FROM sync_group_members WHERE device_id = 'a'").get())
    .toEqual({ device_name: 'A' });
});

it('rejects a same-id pack from a different library timeline without writes', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b', 'c'], 'timeline-other');
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });

  await expect(port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }))).rejects.toThrow('sync_group_identity_mismatch');
  expect(sqlite.prepare("SELECT COUNT(*) AS value FROM sync_group_members WHERE device_id = 'c'").get())
    .toEqual({ value: 0 });
});

it('accepts a relayed self-departure but refuses a remote departure for the local Device', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b', 'c']);
  sqlite.exec("UPDATE inc.sync_group_members SET state = 'left' WHERE device_id = 'c'");
  sqlite.exec(`INSERT INTO inc.sync_group_member_departures VALUES
    ('group-1', 'c', 'c', 'leave-c', '2026-08-09T03:00:00Z')`);
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });
  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }));
  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE device_id = 'c'").get()).toEqual({ state: 'left' });

  sqlite.exec("DELETE FROM inc.sync_group_member_departures; UPDATE inc.sync_group_members SET state = 'active'");
  sqlite.exec("UPDATE inc.sync_group_members SET state = 'left' WHERE device_id = 'a'");
  sqlite.exec(`INSERT INTO inc.sync_group_member_departures VALUES
    ('group-1', 'a', 'a', 'leave-a', '2026-08-09T04:00:00Z')`);
  await expect(port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }))).rejects.toThrow('sync_group_local_departure_requires_local_action');
});

it('accepts a relayed removal authorized by an active member', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b', 'c']);
  sqlite.exec("UPDATE inc.sync_group_members SET state = 'left' WHERE device_id = 'c'");
  sqlite.exec(`INSERT INTO inc.sync_group_member_departures VALUES
    ('group-1', 'c', 'b', 'remove-c', '2026-08-09T03:00:00Z')`);
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });

  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }));

  expect(sqlite.prepare("SELECT state FROM sync_group_members WHERE device_id = 'c'").get())
    .toEqual({ state: 'left' });
  expect(sqlite.prepare("SELECT authorized_by_device_id FROM sync_group_member_departures WHERE device_id = 'c'").get())
    .toEqual({ authorized_by_device_id: 'b' });
});

it('treats a departure before a newer join as superseded history', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b']);
  sqlite.exec(`UPDATE inc.sync_group_members SET authorization_id = 'join-b-new',
    joined_at = '2026-08-09T04:00:00Z' WHERE device_id = 'b'`);
  sqlite.exec(`INSERT INTO inc.sync_group_member_departures VALUES
    ('group-1', 'b', 'b', 'leave-b-old', '2026-08-09T03:00:00Z')`);
  sqlite.exec(`UPDATE sync_group_members SET state = 'left', left_at = '2026-08-09T03:00:00Z'
    WHERE device_id = 'b'`);
  sqlite.exec(`INSERT INTO sync_group_member_departures VALUES
    ('group-1', 'b', 'b', 'leave-b-old', '2026-08-09T03:00:00Z')`);
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });

  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'a'
  }));

  expect(sqlite.prepare(`SELECT state, authorization_id, joined_at, left_at
    FROM sync_group_members WHERE device_id = 'b'`).get()).toEqual({
    authorization_id: 'join-b-new', joined_at: '2026-08-09T04:00:00Z', left_at: null, state: 'active'
  });
  expect(sqlite.prepare("SELECT COUNT(*) AS value FROM sync_group_member_departures WHERE device_id = 'b'").get())
    .toEqual({ value: 0 });
});

it('ignores a local departure that predates the local Device current join generation', async () => {
  seedGroup(sqlite, 'inc', ['a', 'b']);
  sqlite.exec("UPDATE sync_group_members SET joined_at = '2026-08-09T04:00:00Z' WHERE device_id = 'a'");
  sqlite.exec("UPDATE inc.sync_group_members SET state = 'left' WHERE device_id = 'a'");
  sqlite.exec(`INSERT INTO inc.sync_group_member_departures VALUES
    ('group-1', 'a', 'a', 'leave-a-old', '2026-08-09T03:00:00Z')`);
  const port = createBetterSqliteDbPort(sqlite, { name: 'group-facts-test' });

  await port.transaction((tx) => applySyncPackGroupFactsWithDbPort(tx, {
    incomingAlias: 'inc', sourcePeerId: 'b'
  }));

  expect(sqlite.prepare("SELECT state, joined_at FROM sync_group_members WHERE device_id = 'a'").get())
    .toEqual({ joined_at: '2026-08-09T04:00:00Z', state: 'active' });
});

function seedGroup(db: Database.Database, schema: 'inc' | 'main', devices: string[], timeline = 'timeline-1') {
  const prefix = schema === 'main' ? '' : 'inc.';
  db.prepare(`INSERT INTO ${prefix}sync_groups
    (group_id, display_name, timeline_id, created_by_device_id, created_at${schema === 'main' ? ', updated_at' : ''})
    VALUES (?, ?, ?, ?, ?${schema === 'main' ? ', ?' : ''})`).run(
    'group-1', 'Studio', timeline, 'a', '2026-08-09T00:00:00Z',
    ...(schema === 'main' ? ['2026-08-09T00:00:00Z'] : [])
  );
  for (const [index, device] of devices.entries()) {
    const approver = device === 'a' ? 'a' : device === 'b' ? 'a' : 'b';
    const joined = `2026-08-09T0${index}:00:00Z`;
    if (schema === 'main') {
      db.prepare(`INSERT INTO sync_group_members
        (group_id, device_id, device_kind, device_name, state, approved_by_device_id,
         authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at)
        VALUES ('group-1', ?, 'desktop', ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)`)
        .run(device, device.toUpperCase(), approver, `join-${device}`, joined, joined);
    } else {
      db.prepare(`INSERT INTO inc.sync_group_members VALUES
        ('group-1', ?, 'desktop', ?, 'active', ?, ?, ?, NULL, NULL, ?)`)
        .run(device, device.toUpperCase(), approver, `join-${device}`, joined, joined);
    }
  }
}
