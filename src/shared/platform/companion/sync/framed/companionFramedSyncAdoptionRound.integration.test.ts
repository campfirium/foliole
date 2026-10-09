// @vitest-environment node
import { promises as fs } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import { companionContinuationBridge } from '../../../../../../electron/sync/companionFramedSyncContinuation.testSupport.js';
import { readFixtureInventory } from '../../../../../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { readFramedSyncMissingDependency } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { NativeCompanionFramedSyncPullRequest, NativeCompanionFramedSyncTransferRequest }
  from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

import { sendCompanionFramedSyncInventoryDifferences }
  from './companionFramedSyncInventoryRound.js';


const native = vi.hoisted(() => ({ db: null as DbPort | null, inventory: vi.fn(), pull: vi.fn(), send: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: {
  readFramedSyncInventory: native.inventory, pullFramedSyncObject: native.pull, sendFramedSyncTransfer: native.send,
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

async function adopt() {
  const ready = await setup();
  const { fixture, bridge } = ready;
  await beginSyncGroupLocalAdoption(bridge.db, { endpointUrl: fixture.rightSnapshot.origin,
    groupId: bridge.request.sync_group_id, libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch`,
    providerDeviceId: fixture.rightSnapshot.deviceId, providerDeviceName: 'Source', providerPlatform: 'darwin' });
  await fixture.right.seed({ content: 'Original', nodeId: 't326-adoption-article', title: 'Original' });
  await prepareSyncGroupOverwrite(bridge.db, { groupId: bridge.request.sync_group_id,
    overwriteId: `${fixture.leftSnapshot.deviceId}-epoch`, providerDeviceId: fixture.rightSnapshot.deviceId,
    providerLibraryEpoch: `${fixture.rightSnapshot.deviceId}-epoch`, receiverDeviceId: fixture.leftSnapshot.deviceId,
    receiverLibraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` });
  const inventory = await bridge.readInventory();
  for (const entry of inventory.entries) await bridge.pull({ ...bridge.request, ...entry,
    object_id: entry.global_id, round_id: inventory.round_id });
  await fixture.left.seed({ content: 'Saved local edit😀', nodeId: 't326-adoption-article', title: 'Edited' });
  return ready;
}

it('finishes source adoption and sends an edit in the same production companion round', async () => {
  const { fixture, bridge } = await adopt();
  const result = await sendCompanionFramedSyncInventoryDifferences(bridge.request);
  expect(await loadSyncGroupLocalAdoption(bridge.db)).toBeNull();
  expect(await loadSyncGroupOverwriteProgress(bridge.db)).toBeNull();
  expect(result.deferredObjects).toEqual([]);
  expect(result.sent).toContainEqual(expect.objectContaining({ objectId: 't326-adoption-article' }));
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ content: 'Saved local edit😀' })]);
  }
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}, 15_000);

it('keeps adoption protected when the source changes after its acknowledged delivery', async () => {
  const { fixture, bridge } = await adopt();
  native.pull.mockImplementationOnce(async (input: NativeCompanionFramedSyncPullRequest) => {
    const receipt = await bridge.pull(input);
    await fixture.right.seed({ content: 'Source changed', nodeId: 't326-adoption-article', title: 'Source changed' });
    return receipt;
  });
  const result = await sendCompanionFramedSyncInventoryDifferences(bridge.request);
  expect(await loadSyncGroupLocalAdoption(bridge.db)).not.toBeNull();
  expect(await loadSyncGroupOverwriteProgress(bridge.db)).not.toBeNull();
  expect(result.deferredObjects).toContainEqual({ globalId: 't326-adoption-article', objectType: 'node' });
  expect(result.sent).toEqual([]);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Saved local edit😀' })]);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Source changed' })]);
}, 15_000);
