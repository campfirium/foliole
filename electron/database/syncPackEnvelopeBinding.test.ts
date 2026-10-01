// @vitest-environment node

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { writeStoredZip } from '../diagnostics/zipStore.js';
import { applyDesktopSyncGroupPack } from '../sync/desktopSyncGroupPackApply.js';

import { openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';
import {
  insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));
vi.mock('../sync/workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: vi.fn() }));
setupSyncPackBuilderTestLifecycle();
const source = createSyncGroupDeviceIdentity({ device_anchor: 'a1111111-1111-4111-8111-111111111111',
  group_id: 'group', library_path: '/source', path_flavor: 'posix' });
const target = createSyncGroupDeviceIdentity({ device_anchor: 'b2222222-2222-4222-8222-222222222222',
  group_id: 'group', library_path: '/target', path_flavor: 'posix' });

function entries(body: Buffer) {
  const result: Array<{ name: string; content: Buffer }> = [];
  let offset = 0;
  while (body.readUInt32LE(offset) === 0x04034b50) {
    const size = body.readUInt32LE(offset + 18);
    const nameLength = body.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength + body.readUInt16LE(offset + 28);
    result.push({ name: body.subarray(offset + 30, offset + 30 + nameLength).toString(), content: body.subarray(start, start + size) });
    offset = start + size;
  }
  return result;
}

async function pack(mutate?: (manifest: Record<string, unknown>) => void) {
  openDatabaseConnection().sqlite.exec(`
    INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state
      (singleton_id, group_id, local_device_identity_key, state, updated_at)
      VALUES (1, 'group', '${source.identity_key}', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', '${source.identity_key}', '${source.device_anchor}', '/source',
        'Source', 'mac', 'active', 'now', 'now');
  `);
  insertNodeSyncState();
  const outputPath = resolveSyncPackPath('source.zip');
  const built = await buildDesktopSyncPack({
    outputPath, packId: 'binding-test', fromStateSeq: 0,
    fromPeerId: source.identity_key, toPeerId: target.identity_key
  });
  openDatabaseConnection().sqlite.prepare(`UPDATE sync_group_local_state
    SET local_device_identity_key = ? WHERE singleton_id = 1`).run(target.identity_key);
  const files = entries(await fs.readFile(outputPath));
  const file = files.find((entry) => entry.name === 'manifest.json')!;
  const manifest = JSON.parse(file.content.toString());
  mutate?.(manifest);
  file.content = Buffer.from(JSON.stringify(manifest));
  await writeStoredZip(outputPath, files);
  return { body: await fs.readFile(outputPath), built };
}

async function apply(body: Buffer) {
  const archivePath = resolveSyncPackPath('incoming.zip');
  await fs.writeFile(archivePath, body);
  return applyDesktopSyncGroupPack({
    after: 0,
    peer: { endpoint_url: 'http://unused', group_id: 'group', local_device_id: target.identity_key,
      peer_device_id: source.identity_key, peer_device_name: 'Source' }
  }, archivePath, path.dirname(resolveSyncPackPath('incoming.db')));
}

it('accepts a real generated pack and returns the committed inner frontier', async () => {
  const { body, built } = await pack();
  await expect(apply(body)).resolves.toMatchObject({ cursor: built.toStateSeq });
});

it.each(['to_state_seq', 'from_state_seq', 'pack_id', 'tables'])(
  'rejects a checksum-valid outer %s mismatch before any library mutation', async (field) => {
    const { body } = await pack((manifest) => {
      if (field === 'tables') (manifest.tables as Array<{ row_count: number }>)[0]!.row_count += 1;
      else if (field === 'pack_id') manifest[field] = 'another-pack';
      else manifest[field] = Number(manifest[field]) + (field === 'to_state_seq' ? -1 : 1);
    });
    const db = openDatabaseConnection().sqlite;
    const before = db.prepare('SELECT * FROM sync_object_state ORDER BY object_type, object_id').all();
    const changes = db.prepare('SELECT total_changes() AS count').get();
    await expect(apply(body)).rejects.toThrow('sync_pack_inner_manifest_mismatch');
    expect(db.prepare('SELECT total_changes() AS count').get()).toEqual(changes);
    expect(db.prepare('SELECT * FROM sync_object_state ORDER BY object_type, object_id').all()).toEqual(before);
    expect(db.prepare('PRAGMA database_list').all()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'inc' })]));
  }
);
