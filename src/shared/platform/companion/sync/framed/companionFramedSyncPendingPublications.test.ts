// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../../../../lib/core/database/framedSyncStagingSchema.js';
import { SYNC_GROUP_METADATA_SCHEMA } from '../../../../../../lib/core/database/syncGroupSchemaStatements.js';
import { canonicalContentId, canonicalTransferId } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { publishFramedSyncOutboundWithDbPort } from '../../../../../../lib/core/sync/framedSyncOutboundStaging.js';
import { PARENT_ORDER_VERSION_SCHEMA } from '../../../../../../lib/core/sync/syncParentOrderVersionStore.js';

const mocks = vi.hoisted(() => ({ db: undefined as unknown, send: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { sendFramedSyncTransfer: mocks.send }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: unknown) => unknown) => task(mocks.db),
    runWriter: (task: (db: unknown) => unknown) => task(mocks.db)
  })
}));
vi.mock('../../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => unknown) => task()
}));

import { rememberCompanionFramedSyncPeerRoute, resumeCompanionFramedSyncRespondingPeer } from './companionFramedSyncPeerRoutes.js';
import { resumeCompanionFramedSyncPendingPublications } from './companionFramedSyncPendingPublications.js';

let sqlite: Database.Database;
let directory = '';
afterEach(() => {
  sqlite?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = '';
  vi.resetAllMocks();
});
const request = { endpoint_url: 'http://desktop', receiver_device_id: 'B',
  receiver_library_epoch: 'B-epoch', sync_group_id: 'group' };

async function publish(receiver = 'B', senderEpoch = 'A-epoch', receiverEpoch = `${receiver}-epoch`) {
  const manifest = { blobs: [], facts: [{ blobs: [], body: [], factId: 'version-1',
    globalId: 'node', kind: 2, objectType: 'node', sharedStateHash: new Uint8Array(32).fill(1) }] };
  const context = { groupId: 'group', protocolVersion: 22 as const,
    receiverDeviceId: receiver, receiverLibraryEpoch: receiverEpoch,
    senderDeviceId: 'A', senderLibraryEpoch: senderEpoch };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await publishFramedSyncOutboundWithDbPort(createBetterSqliteDbPort(sqlite), {
    contentId, context, manifest, manifestHash: contentId, transferId });
  return Buffer.from(transferId).toString('hex');
}

function database(persistent = false) {
  if (persistent) {
    const root = path.resolve('.tmp/artifacts/T328');
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(path.join(root, 'peer-route-'));
  }
  sqlite = new Database(persistent ? path.join(directory, 'route.db') : ':memory:');
  sqlite.exec(SYNC_GROUP_METADATA_SCHEMA);
  for (const sql of [...FRAMED_SYNC_STAGING_SCHEMA, ...PARENT_ORDER_VERSION_SCHEMA]) sqlite.exec(sql);
  sqlite.exec(`CREATE TABLE sync_group_local_state (singleton_id INTEGER, state TEXT,
    group_id TEXT, local_device_identity_key TEXT);
    INSERT INTO sync_group_local_state VALUES (1, 'active', 'group', 'A');
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT);
    INSERT INTO node_version_local_proof_state VALUES (1, 'A-epoch');`);
  sqlite.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  mocks.db = createBetterSqliteDbPort(sqlite);
}

it('drains only the current peer publication even without a new inventory difference', async () => {
  database();
  const id = await publish();
  await publish('C');
  await publish('B', 'old-epoch');
  await publish('B', 'A-epoch', 'old-peer-epoch');
  mocks.send.mockResolvedValue({ transfer_id: id, receiver_device_id: 'B', receiver_library_epoch: 'B-epoch' });
  await expect(resumeCompanionFramedSyncPendingPublications(request)).resolves.toBe(1);
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ ...request, transfer_id: id,
    include_current_node: false, object_id: 'node', object_type: 'node', required_relation_ids: [],
    review_fact_ids: [], state_fact_ids: [] });
});

it('finishes receipt-backed hold release without resending or releasing C', async () => {
  database();
  const id = await publish();
  await publish('C');
  sqlite.prepare(`INSERT INTO framed_sync_receipts
    SELECT transfer_id, content_id, receiver_device_id, receiver_library_epoch, content_id
    FROM framed_sync_outbound_publications WHERE hex(transfer_id) = ?`).run(id.toUpperCase());
  sqlite.prepare(`UPDATE framed_sync_outbound_publications SET state = 'receipt_committed'
    WHERE hex(transfer_id) = ?`).run(id.toUpperCase());
  await expect(resumeCompanionFramedSyncPendingPublications(request)).resolves.toBe(1);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(sqlite.prepare('SELECT member_id FROM framed_sync_outbound_holds').all())
    .toEqual([{ member_id: 'C' }]);
});

it('resumes a responding peer after reloading its exact verified route', async () => {
  database(true);
  const id = await publish();
  mocks.send.mockResolvedValue({ transfer_id: id, receiver_device_id: 'B', receiver_library_epoch: 'B-epoch' });
  await rememberCompanionFramedSyncPeerRoute(request);
  sqlite.close();
  sqlite = new Database(path.join(directory, 'route.db'));
  mocks.db = createBetterSqliteDbPort(sqlite);
  await resumeCompanionFramedSyncRespondingPeer({ group_id: 'group',
    peer_device_id: 'B', peer_library_epoch: 'other-epoch' });
  expect(mocks.send).not.toHaveBeenCalled();
  await resumeCompanionFramedSyncRespondingPeer({ group_id: 'group',
    peer_device_id: 'B', peer_library_epoch: 'B-epoch' });
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    endpoint_url: request.endpoint_url, transfer_id: id }));
});
