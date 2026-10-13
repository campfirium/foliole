// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { applyDesktopSyncGroupMemberState, loadDesktopSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

const connection = vi.hoisted(() => ({ current: null as unknown as { driver: unknown } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection.current }));

const identities = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
].map((deviceAnchor, index) => createSyncGroupDeviceIdentity({
  device_anchor: deviceAnchor, group_id: 'group-1', library_path: `/library/${index}`, path_flavor: 'posix'
}));

function use(database: Database.Database) {
  connection.current = { driver: createBetterSqlite3Driver(database) };
}

function device(localIndex: number) {
  const database = new Database(':memory:');
  initializeDatabaseSchema(database); use(database);
  createDesktopSyncGroup({ device: identities[localIndex]!, deviceName: `Device ${localIndex}`,
    platform: 'desktop', workgroupKey: Buffer.alloc(32, 4).toString('base64url'),
    now: '2026-10-14T00:00:00.000Z' });
  registerSyncGroupDevice({ device: identities[1 - localIndex]!, deviceName: 'Peer', platform: 'desktop' });
  database.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('original', 'topic', 'Original title', 'Original body', '2026-10-14', '2026-10-14')`).run();
  return database;
}

function storedTables(database: Database.Database) {
  const tables = database.prepare<[], { name: string }>(
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all();
  return tables.map(({ name }) => ({ name,
    rows: database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()
  }));
}

it.each(['group', 'authenticated-device'] as const)(
  'rejects a different %s while retaining valid member facts and all stored data', mismatch => {
    const target = device(0); const source = device(1);
    try {
      const incoming = loadDesktopSyncGroupMemberState();
      expect(incoming.devices.map(member => member.device_identity_key).sort())
        .toEqual(identities.map(identity => identity.identity_key).sort());
      const validDevices = structuredClone(incoming.devices);
      if (mismatch === 'group') incoming.group_id = 'other-group';
      const authenticated = mismatch === 'authenticated-device' ? identities[0]!.identity_key : identities[1]!.identity_key;
      use(target);
      loadDesktopSyncGroupMemberState();
      const before = storedTables(target);
      const changes = target.prepare('SELECT total_changes()').pluck().get();
      expect(() => applyDesktopSyncGroupMemberState(incoming, authenticated))
        .toThrow('sync_group_member_state_identity_mismatch');
      expect(incoming.devices).toEqual(validDevices);
      expect(storedTables(target)).toEqual(before);
      expect(target.prepare('SELECT total_changes()').pluck().get()).toBe(changes);
      expect(target.prepare("SELECT title, content FROM nodes WHERE id = 'original'").get())
        .toEqual({ title: 'Original title', content: 'Original body' });
    } finally { source.close(); target.close(); }
  });
