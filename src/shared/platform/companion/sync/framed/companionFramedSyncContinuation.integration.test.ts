// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { companionContinuationBridge } from '../../../../../../electron/sync/companionFramedSyncContinuation.testSupport.js';
import { readFixtureInventory, reconnectFixturePeer } from '../../../../../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from '../../../../../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { createDesktopFramedSyncFaultProxy } from '../../../../../../electron/sync/desktopFramedSyncTwoProcessFaultProxy.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { readFramedSyncMissingDependency } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import type { NativeCompanionFramedSyncPullRequest, NativeCompanionFramedSyncTransferRequest }
  from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

import { sendCompanionFramedSyncInventoryDifferences }
  from './companionFramedSyncInventoryRound.js';
import { prepareCompanionFramedSyncOutbound }
  from './companionFramedSyncOutbound.js';
import { resumeCompanionFramedSyncPendingPublications }
  from './companionFramedSyncPendingPublications.js';


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

it('recaptures inventory after a pull supersedes its stale outbound side and returns converged facts', async () => {
  const { fixture, bridge } = await setup();
  const nodeId = 't326-companion-continuation';
  await fixture.left.seed({ content: 'Original', nodeId, title: 'Original' });
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  await fixture.right.seed({ content: 'Remote saved edit😀', nodeId, title: 'Remote edit' });
  const result = await sendCompanionFramedSyncInventoryDifferences(bridge.request);
  expect(result.deferredObjects).toEqual([]);
  expect(result.received).toContainEqual(expect.objectContaining({ objectId: nodeId }));
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Remote saved edit😀' })]);
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
  for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
    const sqlite = new Database(snapshot.databasePath, { readonly: true });
    try {
      expect(sqlite.prepare('SELECT count(*) FROM node_text_alternatives WHERE node_id = ?')
        .pluck().get(nodeId)).toBe(0);
    } finally { sqlite.close(); }
  }
  expect(native.inventory.mock.calls.length).toBeGreaterThan(1);
}, 15_000);

it('completes another finite round for an edit made after the selected input was fixed', async () => {
  const { fixture, bridge } = await setup();
  const nodeId = 't326-companion-frozen-edit';
  await fixture.right.seed({ content: 'Fixed body', nodeId, title: 'Fixed' });
  native.pull.mockImplementationOnce(async (input: NativeCompanionFramedSyncPullRequest) => {
    const receipt = await bridge.pull(input);
    await fixture.right.seed({ content: 'Later saved body', nodeId, title: 'Later' });
    return receipt;
  });
  const result = await sendCompanionFramedSyncInventoryDifferences(bridge.request);
  expect(result.deferredObjects).toEqual([]);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Later saved body' })]);
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}, 15_000);

it('retains a blocked frozen review, delivers independent work and reconciles it after reopening', async () => {
  const { fixture, bridge: original } = await setup();
  await fixture.left.seedRelationReview('sender');
  const prepared = await prepareCompanionFramedSyncOutbound(original.db, { ...original.request, group_id: original.request.sync_group_id,
    sender_device_id: fixture.leftSnapshot.deviceId, sender_library_epoch: 'desktop-a-epoch',
    object_id: 't326-relation-review', object_type: 'node', include_current_node: false,
    required_relation_ids: [], state_fact_ids: [], review_fact_ids: ['t326-review-op'] });
  const before = original.sqlite.prepare('SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?')
    .get(Buffer.from(prepared.transfer_id, 'hex'));
  await expect(resumeCompanionFramedSyncPendingPublications(original.request, [])).resolves.toBe(1);
  expect(original.sqlite.prepare('SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?')
    .get(Buffer.from(prepared.transfer_id, 'hex'))).toEqual(before);
  expect(original.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds WHERE transfer_id = ?')
    .pluck().get(Buffer.from(prepared.transfer_id, 'hex'))).toBe(1);
  await fixture.left.seed({ content: 'Independent', nodeId: 't326-independent', title: 'Independent' });
  const result = await sendCompanionFramedSyncInventoryDifferences(original.request);
  expect(result.deferredObjects).toEqual([]);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ id: 't326-independent', content: 'Independent' }));
  original.sqlite.close();
  bridge = companionContinuationBridge(fixture.leftSnapshot, fixture.rightSnapshot);
  native.db = bridge.db;
  native.inventory.mockImplementation(bridge.readInventory);
  native.send.mockImplementation(bridge.send);
  const inventory = await readFixtureInventory(fixture.right);
  await resumeCompanionFramedSyncPendingPublications(bridge.request, inventory);
  expect(bridge.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds WHERE transfer_id = ?')
    .pluck().get(Buffer.from(prepared.transfer_id, 'hex'))).toBe(0);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).reviews)
    .toEqual([expect.objectContaining({ op_id: 't326-review-op', grade: 3 })]);
}, 15_000);

it('returns pending without spinning when a local body is unavailable while committing a neighbor', async () => {
  const { fixture, bridge } = await setup();
  for (const nodeId of ['t326-unavailable', 't326-neighbor']) {
    await fixture.left.seed({ content: 'Initial body', nodeId, title: nodeId });
  }
  await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
  await fixture.left.seed({ content: 'Unavailable edit', nodeId: 't326-unavailable', title: 'Unavailable' });
  await fixture.left.seed({ content: 'Independent edit', nodeId: 't326-neighbor', title: 'Independent' });
  bridge.sqlite.prepare("UPDATE node_sync_versions SET body_text = NULL WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 't326-unavailable')").run();
  const result = await sendCompanionFramedSyncInventoryDifferences(bridge.request);
  expect(result.deferredObjects).toContainEqual({ globalId: 't326-unavailable', objectType: 'node' });
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes).toEqual([
    expect.objectContaining({ id: 't326-neighbor', content: 'Independent edit' }),
    expect.objectContaining({ id: 't326-unavailable', content: 'Initial body' })
  ]);
  expect(native.inventory.mock.calls.filter(([request]) => !request.detail_global_ids?.length).length).toBeLessThanOrEqual(3);
  const source = new Database(fixture.leftSnapshot.databasePath);
  try {
    source.prepare("UPDATE node_sync_versions SET body_text = ? WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 't326-unavailable')").run('Unavailable edit');
  } finally { source.close(); }
  expect((await sendCompanionFramedSyncInventoryDifferences(bridge.request)).deferredObjects).toEqual([]);
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toContainEqual(expect.objectContaining({ id: 't326-unavailable', content: 'Unavailable edit' }));
}, 15_000);

it('keeps later saved text after a lost acknowledgment and source restart', async () => {
  const { fixture, bridge: original } = await setup();
  const nodeId = 't326-companion-lost-ack';
  await fixture.left.seed({ content: 'Fixed original', nodeId, title: 'Original' });
  const proxy = await createDesktopFramedSyncFaultProxy({ dropReceiptResponseAt: 1,
    fault: 'drop_receipt_response', targetOrigin: fixture.rightSnapshot.origin });
  try {
    await expect(original.send({ ...original.request, endpoint_url: proxy.origin,
      include_current_node: true, object_id: nodeId, object_type: 'node',
      required_relation_ids: [], review_fact_ids: [], state_fact_ids: [] })).rejects.toThrow();
  } finally { await proxy.close(); }
  expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
    .toEqual([expect.objectContaining({ content: 'Fixed original' })]);
  expect(original.sqlite.prepare("SELECT count(*) FROM framed_sync_outbound_publications WHERE state = 'published'")
    .pluck().get()).toBeGreaterThan(0);
  await fixture.left.seed({ content: 'Later saved after lost acknowledgment', nodeId, title: 'Later' });
  original.sqlite.close();
  const restarted = await fixture.restartLeft();
  bridge = companionContinuationBridge(restarted.snapshot, fixture.rightSnapshot);
  native.db = bridge.db;
  native.inventory.mockImplementation(bridge.readInventory);
  native.pull.mockImplementation(bridge.pull);
  native.send.mockImplementation(bridge.send);
  expect((await sendCompanionFramedSyncInventoryDifferences(bridge.request)).deferredObjects).toEqual([]);
  for (const snapshot of [restarted.snapshot, fixture.rightSnapshot]) {
    expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ content: 'Later saved after lost acknowledgment' })]);
  }
  expect(bridge.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0);
  expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
}, 15_000);
