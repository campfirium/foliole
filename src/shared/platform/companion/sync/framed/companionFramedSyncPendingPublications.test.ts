// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../../../../../lib/core/database/framedSyncStagingSchema.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_METADATA_SCHEMA, SYNC_GROUP_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/syncGroupSchemaStatements.js';
import { canonicalContentId, canonicalTransferId } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { createFramedSyncFileOutboundStaging } from '../../../../../../lib/core/sync/framedSyncFileOutbound.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { loadFramedSyncFileTask, publishFramedSyncFileOutbound } from '../../../../../../lib/core/sync/framedSyncFilePublication.js';

const mocks = vi.hoisted(() => ({ db: undefined as unknown, files: undefined as unknown, send: vi.fn(), inventory: vi.fn() }));
vi.mock('./companionFramedSyncFiles.js', () => ({ currentCompanionFramedSyncFiles: () => mocks.files }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { sendFramedSyncTransfer: mocks.send, readFramedSyncInventory: mocks.inventory }
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
  const context = { groupId: 'group', protocolVersion: 23 as const,
    receiverDeviceId: receiver, receiverLibraryEpoch: receiverEpoch,
    senderDeviceId: 'A', senderLibraryEpoch: senderEpoch };
  const contentId = await canonicalContentId(manifest);
  const transferId = await canonicalTransferId(context, contentId);
  await publishFramedSyncFileOutbound(files(), {
    contentId, context, manifest, manifestHash: contentId, transferId });
  return Buffer.from(transferId).toString('hex');
}

function files() { return mocks.files as FramedSyncFilePort; }
function task(id: string) { return loadFramedSyncFileTask(files(), Buffer.from(id, 'hex')); }
async function confirm(id: string) {
  const publication = (await task(id))!;
  await createFramedSyncFileOutboundStaging(files()).commitOutboundReceipt({
    transferId: publication.transferId, contentId: publication.contentId,
    receiverDeviceId: publication.context.receiverDeviceId,
    receiverLibraryEpoch: publication.context.receiverLibraryEpoch,
    appliedStateHash: publication.contentId
  });
}

function database(persistent = false) {
  {
    const root = path.resolve('.tmp/artifacts/T341');
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(path.join(root, 'peer-route-'));
  }
  mocks.files = createDesktopFramedSyncFiles(path.join(directory, 'transport'));
  sqlite = new Database(persistent ? path.join(directory, 'route.db') : ':memory:');
  sqlite.exec(SYNC_GROUP_METADATA_SCHEMA);
  sqlite.exec(SYNC_GROUP_SCHEMA_STATEMENTS[1]!);
  sqlite.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', '2026-10-07', '2026-10-07')");
  for (const sql of SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS) sqlite.exec(sql);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  sqlite.exec(`CREATE TABLE sync_group_local_state (singleton_id INTEGER, state TEXT,
    group_id TEXT, local_device_identity_key TEXT);
    INSERT INTO sync_group_local_state VALUES (1, 'active', 'group', 'A');
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT);
    INSERT INTO node_version_local_proof_state VALUES (1, 'A-epoch');`);
  sqlite.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  mocks.db = createBetterSqliteDbPort(sqlite);
  mocks.inventory.mockResolvedValue({ entries: [], round_id: '0'.repeat(32) });
}

it('drains only the current peer publication even without a new inventory difference', async () => {
  database();
  const id = await publish();
  await publish('C');
  await publish('B', 'old-epoch');
  await publish('B', 'A-epoch', 'old-peer-epoch');
  mocks.send.mockImplementation(async () => {
    await confirm(id);
    return { transfer_id: id, receiver_device_id: 'B', receiver_library_epoch: 'B-epoch' };
  });
  await expect(resumeCompanionFramedSyncPendingPublications(request)).resolves.toBe(1);
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ ...request, transfer_id: id,
    include_current_node: false, object_id: 'node', object_type: 'node', required_relation_ids: [],
    review_fact_ids: [], state_fact_ids: [] });
});

it('finishes receipt-backed hold release without resending or releasing C', async () => {
  database();
  const id = await publish();
  const other = await publish('C');
  await confirm(id);
  await expect(resumeCompanionFramedSyncPendingPublications(request)).resolves.toBe(0);
  expect(mocks.send).not.toHaveBeenCalled();
  expect((await task(id))?.state).toBe('retired');
  expect((await task(other))?.state).toBe('published');
  expect(sqlite.prepare('SELECT * FROM framed_sync_outbound_publications').all()).toEqual([]);
});

it('resumes a responding peer after reloading its exact verified route', async () => {
  database(true);
  const id = await publish();
  mocks.send.mockImplementation(async () => {
    await confirm(id);
    return { transfer_id: id, receiver_device_id: 'B', receiver_library_epoch: 'B-epoch' };
  });
  await rememberCompanionFramedSyncPeerRoute(request);
  sqlite.close();
  sqlite = new Database(path.join(directory, 'route.db'));
  mocks.db = createBetterSqliteDbPort(sqlite);
  mocks.inventory.mockResolvedValue({ entries: [], round_id: '0'.repeat(32) });
  await resumeCompanionFramedSyncRespondingPeer({ group_id: 'group',
    peer_device_id: 'B', peer_library_epoch: 'other-epoch' });
  expect(mocks.send).not.toHaveBeenCalled();
  await resumeCompanionFramedSyncRespondingPeer({ group_id: 'group',
    peer_device_id: 'B', peer_library_epoch: 'B-epoch' });
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    endpoint_url: request.endpoint_url, transfer_id: id }));
});

it.each(['restore', 'progress'] as const)('keeps durable outgoing work unsent during pending %s', async (phase) => {
  database();
  const id = await publish();
  if (phase === 'restore') sqlite.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES ('restore', 'group', '2026-10-07', 'B', NULL, '2026-10-07')`).run();
  else sqlite.prepare('INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)').run(
    'sync_group_overwrite_progress', JSON.stringify({ groupId: 'group', overwriteId: 'restore',
      providerDeviceId: 'B', providerLibraryEpoch: 'B-epoch', receiverDeviceId: 'A',
      receiverLibraryEpoch: 'A-epoch' }), '2026-10-07');
  const before = await task(id);
  await expect(resumeCompanionFramedSyncPendingPublications(request)).resolves.toBe(0);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.inventory).not.toHaveBeenCalled();
  expect(await task(id)).toEqual(before);
  expect((await task(id))?.state).toBe('published');
});

it.each(['authenticated_resource_hash_mismatch', 'framed_sync_publication_context_missing',
  'fetch failed', 'untrusted framed_sync_review_node_missing:node'])(
  'keeps %s fatal and preserves the original publication', async error => {
    database();
    const id = await publish();
    const before = await task(id);
    mocks.send.mockRejectedValue(new Error(error));
    await expect(resumeCompanionFramedSyncPendingPublications(request, [])).rejects.toThrow(error);
    expect(await task(id)).toEqual(before);
    expect((await task(id))?.state).toBe('published');
  }
);
