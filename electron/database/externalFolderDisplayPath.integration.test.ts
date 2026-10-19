// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateExternalFolderDisplayPaths } from '../../lib/core/database/externalFolderDisplayPathMigration.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';

import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';

const at = '2026-10-01T00:00:00.000Z';
const folder = { id: 'library', source_ref: 'external:library', host_name: 'Provider', host_platform: 'darwin',
  attachment_mode: 'document_relative_first_then_fixed_root', excluded_dirs_json: '[]', owner_device_identity_key: 'source' };

async function seed(peer: RestorePeer, folderPath?: string, updatedAt = at) {
  const payload = { ...folder, ...(folderPath ? { folder_path: folderPath } : {}) };
  await applySyncObjectInTransaction(peer.db, { object_type: 'external_folder', object_id: folder.id,
    payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('external_folder', payload),
    updated_at: updatedAt, deleted_at: null });
}

async function send(source: RestorePeer, target: RestorePeer) {
  const difference = compareFramedSyncInventories({ local: await readFramedSyncInventory(source.db),
    remote: await readFramedSyncInventory(target.db) }).find(value => value.objectType === 'external_folder');
  if (!difference) throw new Error('expected_folder_difference');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
  target.reopen();
}

function read(peer: RestorePeer) {
  return peer.sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.external_folder).pluck().get(folder.id) as string;
}

it.each(['/Users/provider/资料库', 'D:\\Documents\\Library'])('persists and relays the provider path %s without a local connection', async folderPath => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const observer = fixture.peer('observer');
  try {
    await seed(source, folderPath);
    await send(source, target);
    expect(JSON.parse(read(target))).toHaveProperty('folder_path', folderPath);
    await send(target, observer);
    expect(read(observer)).toBe(read(source));
    await seed(source, `${folderPath}-moved`, '2026-10-02T00:00:00.000Z');
    await send(source, target);
    expect(JSON.parse(read(target))).toHaveProperty('folder_path', `${folderPath}-moved`);
    expect(target.sqlite.prepare('SELECT root_path, type_settings_json FROM desktop_sources').get()).toMatchObject({
      root_path: '', type_settings_json: expect.stringContaining('"connectionStatus":"needs-folder"')
    });
    expect(target.sqlite.prepare("SELECT content_hash FROM sync_object_state WHERE object_type = 'external_folder'")
      .pluck().get()).toBe(computeSyncContentHash('external_folder', JSON.parse(read(target))));
  } finally { await fixture.close(); }
});

it('republishes existing provider paths once and fills a previously empty remote path', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await seed(source); await seed(target);
    source.sqlite.prepare('UPDATE external_search_folders SET folder_path = ?').run('/existing/library');
    source.sqlite.prepare('UPDATE desktop_sources SET root_path = ?, type_settings_json = ?').run('/existing/library',
      JSON.stringify({ ownerDeviceIdentityKey: 'source', connectionStatus: 'connected', attachmentRootPath: '/private/attachments' }));
    migrateExternalFolderDisplayPaths(target.sqlite);
    expect(JSON.parse(read(target))).not.toHaveProperty('folder_path');
    migrateExternalFolderDisplayPaths(source.sqlite);
    const state = source.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'external_folder'").get();
    migrateExternalFolderDisplayPaths(source.sqlite);
    expect(source.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type = 'external_folder'").get()).toEqual(state);
    await send(source, target);
    expect(JSON.parse(read(target))).toHaveProperty('folder_path', '/existing/library');
    expect(read(target)).not.toContain('/private/attachments');
    expect(source.sqlite.prepare('SELECT root_path FROM desktop_sources').pluck().get()).toBe('/existing/library');
  } finally { await fixture.close(); }
});
