// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import { companionContinuationBridge } from '../../../../../../electron/sync/companionFramedSyncContinuation.testSupport.js';
import { readFixtureInventory } from '../../../../../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { readFramedSyncMissingDependency } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { loadSyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent } from '../../../../../../lib/core/sync/syncGroupRestoreEvents.js';
import type { NativeCompanionFramedSyncPullRequest, NativeCompanionFramedSyncTransferRequest }
  from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { syncCompanionIdentityObjects } from '../syncGroupIdentityCompanionResult.js';

const native = vi.hoisted(() => ({ db: null as DbPort | null, inventory: vi.fn(), pull: vi.fn(), resolve: vi.fn(), send: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  resolveAttachmentResource: native.resolve, readFramedSyncInventory: native.inventory, pullFramedSyncObject: native.pull, sendFramedSyncTransfer: native.send,
  pullFramedSyncObjects: async (input: { requests: NativeCompanionFramedSyncPullRequest[] }) => {
    const received = [];
    for (const request of input.requests) received.push({ ...request,
      receipt: await native.pull({ ...input, ...request }) });
    return { received };
  },
  sendFramedSyncTransfers: async (input: { transfers: NativeCompanionFramedSyncTransferRequest[] }) => {
    const outcomes = [];
    for (const transfer of input.transfers) {
      try {
        outcomes.push({ kind: 'committed', object_id: transfer.object_id, object_type: transfer.object_type,
          receipt: await native.send({ ...input, ...transfer }) });
      } catch (error) {
        if (!readFramedSyncMissingDependency(error)) throw error;
        outcomes.push({ kind: 'deferred', object_id: transfer.object_id, object_type: transfer.object_type,
          error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { outcomes };
  }
} }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: DbPort) => unknown) => { if (!native.db) throw new Error('fixture_closed'); return task(native.db); },
    runWriter: (task: (db: DbPort) => unknown) => { if (!native.db) throw new Error('fixture_closed'); return task(native.db); }
  })
}));


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

async function setup() {
  fixture = await createDesktopFramedSyncTwoProcessFixture();
  bridge = companionContinuationBridge(fixture.leftSnapshot, fixture.rightSnapshot);
  native.db = bridge.db;
  native.inventory.mockImplementation(bridge.readInventory);
  native.pull.mockImplementation(bridge.pull);
  native.send.mockImplementation(bridge.send);
  return { fixture, bridge };
}

it('receives an authenticated restore before ordinary companion synchronization', async () => {
  const { fixture, bridge } = await setup();
  const restoreId = `restore-${fixture.leftSnapshot.deviceId}`;
  await fixture.left.seed({ content: 'Old library', nodeId: 't326-old-library', title: 'Old' });
  await fixture.right.seed({ content: 'Second restored body', nodeId: 't326-restored-second', title: 'Second' });
  await fixture.right.seed({ content: 'Restored complete body 中😀', nodeId: 't326-restored-body',
    parentNodeId: 't326-restored-second', title: 'Restored' });
  await bridge.db.run(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)`, [restoreId, bridge.request.sync_group_id,
    '2030-01-01T00:00:00.000Z', fixture.rightSnapshot.deviceId, '2030-01-01T00:00:00.000Z']);
  const options = {
    restoreId, framedPeer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: bridge.request.receiver_library_epoch, protocolVersion: 22 }
  };
  await expect(syncCompanionIdentityObjects(fixture.rightSnapshot.origin, { ...options,
    framedPeer: { ...options.framedPeer, deviceId: 'different-source' } })).rejects.toThrow();
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ id: 't326-old-library', content: 'Old library' }));
  let interrupted = false;
  native.pull.mockImplementation(async (input: NativeCompanionFramedSyncPullRequest) => {
    const receipt = await bridge.pull(input).catch((error: unknown) => {
      const dependency = readFramedSyncMissingDependency(error);
      if (!dependency) throw error;
      throw new Error(`Failed to pull framed Sync object. Cause: IllegalStateException: ${dependency.code}${dependency.globalId}`);
    });
    if (!interrupted && input.object_id === 't326-restored-body') {
      interrupted = true;
      throw new Error('receipt_interrupted');
    }
    return receipt;
  });
  await expect(syncCompanionIdentityObjects(fixture.rightSnapshot.origin, options)).rejects.toThrow('receipt_interrupted');
  const progress = await loadSyncGroupOverwriteProgress(bridge.db);
  expect(progress).not.toBeNull();
  expect((await loadLatestSyncGroupRestoreEvent(bridge.db, bridge.request.sync_group_id))?.applied).toBe(false);
  await fixture.restartLeft();
  expect(bridge.sqlite.prepare('SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1')
    .pluck().get()).toBe(restoreId);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ id: 't326-restored-body', content: 'Restored complete body 中😀' }));
  bridge.sqlite.exec(`CREATE TRIGGER reject_received_unit_reset BEFORE DELETE ON nodes
    WHEN OLD.id = 't326-restored-body' BEGIN SELECT RAISE(ABORT, 'received_unit_erased'); END`);
  const result = await syncCompanionIdentityObjects(fixture.rightSnapshot.origin, options);
  expect(result.remainingStructureChangeCount).toBe(0);
  expect(await loadSyncGroupOverwriteProgress(bridge.db)).toBeNull();
  expect((await loadLatestSyncGroupRestoreEvent(bridge.db, bridge.request.sync_group_id))?.applied).toBe(true);
  const expected = [expect.objectContaining({ id: 't326-restored-body', content: 'Restored complete body 中😀' }),
    expect.objectContaining({ id: 't326-restored-second', content: 'Second restored body' })];
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes).toEqual(expected);
  const restarted = await fixture.restartLeft();
  expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).nodes).toEqual(expected);
  expect(await readFixtureInventory(restarted.process)).toEqual(await readFixtureInventory(fixture.right));
}, 15_000);
