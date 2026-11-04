// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { createFolderWriterFixture } from '../../../../../lib/core/sync/folderSync/writeRound.testSupport.js';
import type { FramedSyncFilePort } from '../../../../../lib/core/sync/framedSyncFilePort.js';
import type { FolderSyncNativePlugin } from '../../../../../lib/platform/nativeFolderSyncContract.js';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner.js';

const native = vi.hoisted(() => ({ owner: null as unknown as CapacitorCompanionDatabaseOwner,
  files: null as unknown as FramedSyncFilePort, plugin: null as unknown as FolderSyncNativePlugin }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: () => true },
  registerPlugin: () => new Proxy({}, { get: (_target, key) => (...args: unknown[]) =>
    (native.plugin[key as keyof FolderSyncNativePlugin] as (...values: unknown[]) => unknown)(...args) }) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => native.owner }));
vi.mock('../runtime/companionFramedPayloadBudget.js', () => ({ companionFramedFileOwner: (owner: CapacitorCompanionDatabaseOwner) =>
  ({ library_key: owner.databasePath, generation_id: 'fixture-generation' }) }));
vi.mock('../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  async accessFramedSyncFile(input: { operation: string; key: string; base64?: string }) {
    switch (input.operation) {
      case 'read': { const bytes = await native.files.read(input.key); return { base64: bytes ? Buffer.from(bytes).toString('base64') : null }; }
      case 'write': await native.files.write(input.key, Buffer.from(input.base64!, 'base64')); return {};
      case 'remove': await native.files.remove(input.key); return {};
      case 'list': return { entries: await native.files.list(input.key) };
      default: throw new Error('unexpected_native_operation');
    }
  }
} }));

import { companionFolderSync, readCompanionFolderSyncState } from './companionFolderSync.js';
import { folderNativeFixture } from './folderSyncService.testSupport.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await createFolderWriterFixture();
  cleanups.push(f.close);
  const target = folderNativeFixture(f.root);
  native.plugin = target.plugin;
  native.files = f.files;
  // The lookup/transport seam is replaced; reads and snapshots use independent real SQLite connections.
  native.owner = { databasePath: f.root, read: (read: Parameters<typeof f.host.readSnapshot>[0]) => f.host.readSnapshot(read),
    readSnapshot: f.host.readSnapshot, runWriter: f.host.write } as unknown as CapacitorCompanionDatabaseOwner;
  return f;
}

it('connects the actual companion runtime to coherent database export and persisted native folder state', async () => {
  const f = await fixture();
  const epoch = f.sqlite.prepare('SELECT library_epoch FROM node_version_local_proof_state').pluck().get();
  expect(await readCompanionFolderSyncState()).toEqual({ enabled: false, location: null });
  await companionFolderSync.choose();
  await companionFolderSync.setEnabled(true);
  expect(await companionFolderSync.write()).toMatchObject({ changed: true, changedObjects: 1, generation: 1 });
  expect((await readCompanionFolderSyncState()).location!.completion).toMatchObject({ sourceId: epoch, generation: 1 });
  expect(await companionFolderSync.write()).toMatchObject({ changed: false, protocolBytesWritten: 0 });
  expect(f.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('topic')).toBe('First article');
});

it('saves independently alongside a configured device group without a reachable endpoint', async () => {
  const f = await fixture();
  f.sqlite.exec(`INSERT INTO sync_groups VALUES ('group','Group','key','2026-11-04','2026-11-04');
    INSERT INTO sync_group_local_state VALUES (1,'group','device','active','2026-11-04')`);
  await companionFolderSync.choose();
  await companionFolderSync.setEnabled(true);
  expect((await readCompanionFolderSyncState()).enabled).toBe(true);
  expect(await companionFolderSync.write()).toMatchObject({ changed: true, generation: 1 });
  expect((await readCompanionFolderSyncState()).location!.completion).not.toBeNull();
  expect(f.sqlite.prepare('SELECT group_id FROM sync_group_local_state').pluck().get()).toBe('group');
});
