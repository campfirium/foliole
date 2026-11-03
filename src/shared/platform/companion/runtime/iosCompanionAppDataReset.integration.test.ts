import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ clear: vi.fn(), files: new Map<string, string>(), connections: new Set<string>() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
    registerPlugin: () => ({ ...createCompanionNativeSyncStub(),
      setSyncEnabled: async () => {}, stopSyncGroupProvider: async () => {}, stopDiscoverySession: async () => {},
      clearAppData: native.clear }) };
});
vi.mock('@capacitor-community/sqlite', async importOriginal => ({
  ...await importOriginal<typeof import('@capacitor-community/sqlite')>(),
  CapacitorSQLite: {
    isDatabase: async ({ database }: { database: string }) => ({ result: fs.existsSync(native.files.get(database) ?? '') }),
    createConnection: async ({ database }: { database: string }) => { native.connections.add(database); },
    deleteDatabase: async ({ database }: { database: string }) => {
      if (!native.connections.has(database)) throw new Error('Connection required');
      fs.unlinkSync(native.files.get(database)!);
    },
    closeConnection: async ({ database }: { database: string }) => { native.connections.delete(database); }
  }
}));

import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { clearCompanionAppData } from '../../companionAppData';
import { supportsCompanionAppDataClear } from '../../companionAppDataRuntimeRepository';
import { joinCompanionSyncGroup, loadCompanionSyncGroup } from '../sync/syncGroupStore';

import { createSearchLibrary, reopenSearchLibrary } from './companionSearchSnapshot.testSupport';
import { resumeIosCompanionAppDataReset } from './iosCompanionAppDataReset';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let attachments: string;
beforeEach(async () => {
  window.localStorage.clear();
  native.files.clear();
  native.connections.clear();
  library = await createSearchLibrary(1);
  native.files.set('foliole-companion', path.join(library.root, 'library.db'));
  attachments = path.join(library.root, 'attachments');
  fs.mkdirSync(attachments);
  fs.writeFileSync(path.join(attachments, 'original'), 'local-only content');
  native.clear.mockReset();
  native.clear.mockImplementation(async () => { fs.rmSync(attachments, { recursive: true, force: true }); });
  window.localStorage.setItem('foliole-user-setting', 'saved');
});
afterEach(async () => { await library.close(); });

it('clears iOS through the public action and reopens an empty library ready to join', async () => {
  expect(supportsCompanionAppDataClear()).toBe(true);
  const db = library.database;
  const journalId = 'a1111111-1111-4111-8111-111111111111';
  db.prepare('INSERT INTO companion_meta(key,value,updated_at) VALUES(?,?,?)').run('read_intent_library_id', journalId, 'now');
  const journalPath = path.join(library.root, 'read-intents.db');
  const journal = new Database(journalPath);
  journal.exec("CREATE TABLE saved_intents(content TEXT); INSERT INTO saved_intents VALUES('old reading')");
  journal.close();
  native.files.set(`foliole-read-intents-${journalId}`, journalPath);
  db.exec("INSERT INTO sync_groups VALUES ('old-group','Old','secret','now','now')");
  expect(db.prepare("SELECT id FROM nodes WHERE id = '000000'").get()).toEqual({ id: '000000' });
  await clearCompanionAppData();
  expect(fs.existsSync(native.files.get('foliole-companion')!)).toBe(false);
  expect(fs.existsSync(attachments)).toBe(false);
  expect(fs.existsSync(journalPath)).toBe(false);
  expect(window.localStorage.length).toBe(0);
  const reopened = await reopenSearchLibrary(library.root, '2026-11-03T00:00:00Z', false);
  expect(reopened.db.prepare("SELECT id FROM nodes WHERE id = '000000'").get()).toBeUndefined();
  expect(reopened.db.prepare('SELECT count(*) AS n FROM sync_groups').get()).toEqual({ n: 0 });
  const device = (anchor: string, file: string) => createSyncGroupDeviceIdentity({
    device_anchor: anchor, group_id: 'new-group', library_path: file, path_flavor: 'posix'
  });
  await joinCompanionSyncGroup({ mode: 'use-group', endpointUrl: 'http://provider',
    device: device('a1111111-1111-4111-8111-111111111111', '/phone/library.db'),
    deviceName: 'Phone', displayName: 'New group', platform: 'ios-capacitor', workgroupKey: 'new-secret',
    provider: { device: device('b2222222-2222-4222-8222-222222222222', '/provider/library.db'),
      deviceName: 'Provider', platform: 'darwin' } });
  expect(await loadCompanionSyncGroup()).toMatchObject({ group_id: 'new-group' });
});

it('keeps an interrupted reset pending and finishes it before a library can reopen', async () => {
  native.clear.mockRejectedValueOnce(new Error('Files unavailable'));
  await expect(clearCompanionAppData()).rejects.toThrow('Files unavailable');
  expect(window.localStorage.getItem('foliole-companion-ios-data-clear')).not.toBeNull();
  expect(() => getIosCompanionDatabaseOwner()).toThrow('not ready');
  expect(fs.existsSync(attachments)).toBe(true);
  await resumeIosCompanionAppDataReset();
  expect(window.localStorage.length).toBe(0);
  expect(fs.existsSync(attachments)).toBe(false);
  expect(native.connections.size).toBe(0);
});

it('retains the owner after a close failure so retry can close it before deleting data', async () => {
  const owner = getIosCompanionDatabaseOwner();
  vi.spyOn(owner, 'close').mockRejectedValueOnce(new Error('Close failed'));
  await expect(clearCompanionAppData()).rejects.toThrow('Close failed');
  expect(getIosCompanionDatabaseOwner()).toBe(owner);
  expect(fs.existsSync(native.files.get('foliole-companion')!)).toBe(true);
  expect(native.clear).not.toHaveBeenCalled();
  await clearCompanionAppData();
  expect(fs.existsSync(native.files.get('foliole-companion')!)).toBe(false);
  expect(window.localStorage.length).toBe(0);
});
