// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { companionContinuationBridge } from '../../../../../../electron/sync/companionFramedSyncContinuation.testSupport.js';
import { postCompanionRequestFixture } from '../../../../../../electron/sync/companionRequestSyncHttp.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopSyncGroupSignedHeaders } from '../../../../../../electron/sync/desktopSyncGroupSignedHeaders.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { loadSyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, receiveSyncGroupRestoreEvent } from '../../../../../../lib/core/sync/syncGroupRestoreEvents.js';
import { syncCompanionIdentityObjects } from '../syncGroupIdentityCompanionResult.js';

const native = vi.hoisted(() => ({ db: null as DbPort | null, files: null as FramedSyncFilePort | null,
  inventory: vi.fn(), post: vi.fn(), sign: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  readFramedSyncInventory: native.inventory, postRequestSyncHttp: native.post, signCompanionSyncRequest: native.sign
} }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => ({
  databasePath: '/fixture',
  read: (task: (db: DbPort) => unknown) => task(native.db!),
  readSnapshot: (task: (db: DbPort) => unknown) => task(native.db!),
  runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
}) }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({ companionFramedFileOwner: () => ({
  library_key: '/fixture', generation_id: 'generation'
}) }));
vi.mock('./companionFramedSyncFiles.js', () => ({ currentCompanionFramedSyncFiles: () => native.files! }));
vi.mock('../../../appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppBackground: async () => () => undefined }));

import { rememberCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';

let bridge: ReturnType<typeof companionContinuationBridge> | undefined;
let fixture: Awaited<ReturnType<typeof createDesktopFramedSyncTwoProcessFixture>> | undefined;
afterEach(async () => {
  native.db = null;
  bridge?.sqlite.close();
  if (fixture) {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
  vi.resetAllMocks();
});

it('resumes companion request restore after an object fails without erasing the accepted object', async () => {
  fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true);
  bridge = companionContinuationBridge(fixture.leftSnapshot, fixture.rightSnapshot);
  native.db = bridge.db;
  await bridge.db.run("INSERT INTO companion_meta VALUES ('host_name', 'Mobile', 'now')");
  native.files = createDesktopFramedSyncFiles(path.join(fixture.root, 'mobile-files'));
  native.inventory.mockImplementation(bridge.readInventory);
  native.post.mockImplementation(input => postCompanionRequestFixture(native.files!, input));
  native.sign.mockImplementation(input => ({ headers: createDesktopSyncGroupSignedHeaders({
    groupId: input.sync_group_id, localDeviceId: fixture!.leftSnapshot.deviceId, method: input.method,
    pathWithQuery: input.path_with_query, bodySha256: input.body_hash, secret: Buffer.alloc(32, 7).toString('base64url')
  }) }));
  await fixture.left.seed({ content: 'Old library', nodeId: 't326-old', title: 'Old' });
  await fixture.right.seed({ content: 'First restored body', nodeId: 't326-a', title: 'First' });
  await fixture.right.seed({ content: 'Second complete body 中😀', nodeId: 't326-b', title: 'Second' });
  const event = { group_id: 't326-group', restore_id: 'request-mobile-restore',
    restored_at: '2026-10-07T08:00:00.000Z', source_device_identity_key: fixture.rightSnapshot.deviceId };
  await fixture.right.invoke('publish_identity_restore', { mode: 'restore', peerOrigin: fixture.leftSnapshot.origin,
    peerDeviceId: fixture.leftSnapshot.deviceId, restoreId: event.restore_id });
  await receiveSyncGroupRestoreEvent(bridge.db, event);
  rememberCompanionRequestSyncPeerState({ contract_version: 3, group_id: event.group_id,
    sender_device_identity_key: event.source_device_identity_key, library_epoch: event.restore_id,
    proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: { event, applied: true } }, true);
  const options = { restoreId: event.restore_id, framedPeer: { deviceId: fixture.rightSnapshot.deviceId,
    libraryEpoch: event.restore_id, protocolVersion: 24 } };
  bridge.sqlite.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON nodes
    WHEN NEW.id = 't326-b' BEGIN SELECT RAISE(ABORT, 'second_object_failed'); END`);
  await expect(syncCompanionIdentityObjects(fixture.rightSnapshot.origin, options)).rejects.toThrow('second_object_failed');
  expect(await loadSyncGroupOverwriteProgress(bridge.db)).not.toBeNull();
  expect(await bridge.db.query("SELECT id, content FROM nodes WHERE id IN ('t326-a', 't326-b', 't326-old')"))
    .toEqual([{ id: 't326-a', content: 'First restored body' }]);
  bridge.sqlite.exec(`DROP TRIGGER reject_second;
    CREATE TRIGGER reject_reset BEFORE DELETE ON nodes WHEN OLD.id = 't326-a'
    BEGIN SELECT RAISE(ABORT, 'received_object_erased'); END`);
  const result = await syncCompanionIdentityObjects(fixture.rightSnapshot.origin, options);
  expect(result.remainingStructureChangeCount).toBe(0);
  expect(await loadSyncGroupOverwriteProgress(bridge.db)).toBeNull();
  expect((await loadLatestSyncGroupRestoreEvent(bridge.db, event.group_id))?.applied).toBe(true);
  const expected = [expect.objectContaining({ id: 't326-a', content: 'First restored body' }),
    expect.objectContaining({ id: 't326-b', content: 'Second complete body 中😀' })];
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes).toEqual(expected);
  const restarted = await fixture.restartLeft();
  expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).nodes).toEqual(expected);
}, 30_000);
