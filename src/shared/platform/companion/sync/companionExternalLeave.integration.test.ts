// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { companionNodeSqliteLibrary } from '../runtime/companionNodeSqlite.testSupport';
import { closeIosCompanionDatabase } from '../runtime/iosCompanionDatabaseBootstrap';

import { joinCompanionSyncGroup, leaveCompanionSyncGroupDevice, loadCompanionSyncGroup } from './syncGroupStore';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});

const groupId = 'leave-group';
const device = (name: string) => createSyncGroupDeviceIdentity({
  device_anchor: crypto.randomUUID(), group_id: groupId, library_path: `/${name}/library.db`, path_flavor: 'posix'
});

async function seedExternal(db: DbPort, id: string, ownerKey: string, sequence: number) {
  const source = `external:${id}`;
  await db.run(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, type_settings_json,
    host_name, host_platform, root_path, path_flavor, created_at, updated_at)
    VALUES (?, 'external', ?, ?, 'Desktop', 'darwin', '/mirror', 'posix', 'now', 'now')`,
  [source, id, JSON.stringify({ ownerDeviceIdentityKey: ownerKey })]);
  await db.run(`INSERT INTO external_search_folders (id, folder_path, source_ref, attachment_mode, created_at, updated_at)
    VALUES (?, '/mirror', ?, 'document_relative', 'now', 'now')`, [id, source]);
  const doc = `${id}:note`;
  await db.run(`INSERT INTO external_documents (document_id, folder_id, relative_path, file_name, extension,
    source_size_bytes, source_modified_at, source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at)
    VALUES (?, ?, 'note.md', 'note.md', 'md', 4, 'now', 0, 'hash', 'Note', 'Body', 'now', 'now', 'now')`, [doc, id]);
  await db.run(`INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('external_folder', ?, ?, 'hash', 'Desktop', 'now'),
           ('external_document', ?, ?, 'hash', 'Desktop', 'now')`, [id, sequence, doc, sequence + 1]);
}

async function seedDeparted(db: DbPort, name: string, group: string, leftAt: string) {
  await db.run(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
    device_name, platform, state, joined_at, left_at, updated_at)
    VALUES (?, ?, ?, '/desktop.db', ?, 'darwin', 'left', ?, ?, ?)`, [group, name, name, name, leftAt, leftAt, leftAt]);
}

it('cleans only the current group’s expired mirrors during voluntary departure', async () => {
  const library = companionNodeSqliteLibrary();
  const now = new Date();
  const expired = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const local = device('mobile');
  try {
    const owner = await library.open();
    await joinCompanionSyncGroup({ mode: 'use-group', endpointUrl: 'http://desktop.local', device: local,
      deviceName: 'Mobile', displayName: 'Group', platform: 'android',
      provider: { device: device('sender'), deviceName: 'Sender', platform: 'darwin' }, workgroupKey: 'fixture' });
    await owner.runWriter(async db => {
      await db.run("INSERT INTO sync_groups VALUES ('other-group', 'Other', 'fixture', 'now', 'now')");
      await seedDeparted(db, 'expired', groupId, expired);
      await seedDeparted(db, 'grace', groupId, now.toISOString());
      await seedDeparted(db, 'other', 'other-group', expired);
      await seedExternal(db, 'expired', 'expired', 401);
      await seedExternal(db, 'grace', 'grace', 403);
      await seedExternal(db, 'other', 'other', 405);
      await seedExternal(db, 'local', local.identity_key, 407);
    }, { kind: 'business' });

    await leaveCompanionSyncGroupDevice();
    await closeIosCompanionDatabase();
    const reopened = await library.open();
    expect(await loadCompanionSyncGroup()).toBeNull();
    expect(await reopened.read(db => db.query('SELECT id FROM external_search_folders ORDER BY id')))
      .toEqual([{ id: 'grace' }, { id: 'local' }, { id: 'other' }]);
    expect(await reopened.read(db => db.query("SELECT * FROM desktop_sources WHERE source_ref = 'external:expired'"))).toEqual([]);
    expect(await reopened.read(db => db.query('SELECT folder_id FROM external_documents ORDER BY folder_id')))
      .toEqual([{ folder_id: 'grace' }, { folder_id: 'local' }, { folder_id: 'other' }]);
    expect(await reopened.read(db => db.query(`SELECT object_id, deleted_at FROM sync_object_state
      WHERE object_type IN ('external_document', 'external_folder') ORDER BY object_id`))).toEqual(
      ['grace', 'grace:note', 'local', 'local:note', 'other', 'other:note'].map(object_id => ({ object_id, deleted_at: null })));
  } finally { await library.dispose(); }
});
