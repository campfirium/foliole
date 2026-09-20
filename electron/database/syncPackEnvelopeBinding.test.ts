// @vitest-environment node

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

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
  insertNodeSyncState();
  const outputPath = resolveSyncPackPath('source.zip');
  const built = await buildDesktopSyncPack({
    outputPath, packId: 'binding-test', fromStateSeq: 0,
    fromPeerId: 'source', toPeerId: 'target'
  });
  const files = entries(await fs.readFile(outputPath));
  const file = files.find((entry) => entry.name === 'manifest.json')!;
  const manifest = JSON.parse(file.content.toString());
  mutate?.(manifest);
  file.content = Buffer.from(JSON.stringify(manifest));
  await writeStoredZip(outputPath, files);
  return { body: await fs.readFile(outputPath), built };
}

async function apply(body: Buffer) {
  return applyDesktopSyncGroupPack({
    after: 0,
    peer: { endpoint_url: 'http://unused', group_id: 'group', local_device_id: 'target',
      peer_device_id: 'source', peer_device_name: 'Source' }
  }, body, path.dirname(resolveSyncPackPath('incoming.db')));
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
      else manifest[field] = Number(manifest[field]) + 1;
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
