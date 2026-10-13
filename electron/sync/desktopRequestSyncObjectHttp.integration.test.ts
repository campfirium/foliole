// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath(name: string) {
    if (!sandbox.root) throw new Error('test_paths_not_initialized');
    return `${sandbox.root}/host/${name}`;
  }, isPackaged: false
} }));

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { withRequestSyncReadonlySnapshot } from '../database/requestSyncReadonlySnapshot.js';
import { loadDesktopSyncGroupMemberState } from '../database/syncGroupMemberStateStore.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';
import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { exchangeDesktopRequestSyncInventory } from './desktopRequestSyncInventoryHttp.js';
import { postDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';
import { pullDesktopRequestSyncObject } from './desktopRequestSyncPullHttp.js';
import { clearDesktopSyncGroupMemberStateReadiness, markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

it.each([false, true])('persists through signed HTTP without transfer bookkeeping when response lost=%s', async loseResponse => {
  await mkdir('.tmp/artifacts', { recursive: true });
  sandbox.root = await mkdtemp(path.resolve('.tmp/artifacts/request-sync-http-'));
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(sandbox.root, 'target'));
  const sourcePath = path.join(sandbox.root, 'source.db');
  const source = new Database(sourcePath);
  source.pragma('journal_mode = WAL'); initializeDatabaseSchema(source);
  seedMembership(source, 'peer');
  const sourceDb = createBetterSqliteDbPort(source);
  const files = createDesktopFramedSyncFiles(path.join(sandbox.root, 'source-files'));
  const host: RequestSyncDatabaseHost = { files,
    readSnapshot: (read, signal) => withRequestSyncReadonlySnapshot(sourcePath, read, signal),
    write: write => write(sourceDb) };
  const server = http.createServer((request, response) => {
    void handleProductionCompanionFramedSyncPost({ deviceId: 'local', request, response })
      .catch(error => { response.writeHead(500).end(String(error)); });
  });
  let relay: http.Server | undefined;
  try {
    await seedTarget();
    const base = textBranch('base', 'Original');
    await applyConvergentSyncNodesWithDbPort(sourceDb, [base, textBranch('head', 'Current', base)]);
    const entry = await readFramedSyncInventoryEntry(sourceDb, { objectType: 'node', globalId: 'topic' });
    if (!entry) throw new Error('test_entry_missing');
    const difference = compareFramedSyncInventories({ local: [entry], remote: [] })[0]!;
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_address_invalid');
    const groupKey = new Uint8Array(32).fill(7);
    const relayResult = await startRelay(`http://127.0.0.1:${address.port}`, loseResponse);
    relay = relayResult.server;
    const posting = postDesktopRequestSyncObject(host, { difference, groupKey, groupSecret: Buffer.from(groupKey).toString('base64url'),
      endpointUrl: relayResult.url, context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
        initiatorDeviceId: 'peer', initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
    if (loseResponse) await expect(posting).rejects.toThrow('socket hang up');
    else await posting;
    const databasePath = await assertCommitted();
    const remote = await withRequestSyncReadonlySnapshot(databasePath, db => readFramedSyncInventoryEntry(db, difference));
    expect(compareFramedSyncInventories({ local: [entry], remote: remote ? [remote] : [] })).toEqual([]);
    await pullBack(host, `http://127.0.0.1:${address.port}`, sourcePath);
    await completeRound(host, `http://127.0.0.1:${address.port}`);
    expect(await files.list('requests')).toEqual([]);
    expect(await files.list('sessions')).toEqual([]);
  } finally {
    if (relay) await new Promise<void>(resolve => relay!.close(() => resolve()));
    await new Promise<void>(resolve => server.close(() => resolve()));
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    source.close(); vi.unstubAllEnvs();
    await rm(sandbox.root, { recursive: true }); sandbox.root = '';
  }
});

async function seedTarget() {
  await runWithDatabaseConnectionOwner(() => {
    const { sqlite, dbPath } = openDatabaseConnection();
    expect(dbPath.startsWith(path.join(sandbox.root, 'target'))).toBe(true);
    initializeDatabaseSchema(sqlite);
    seedMembership(sqlite, 'local');
  });
  const state: SyncGroupMemberStatePayload = { contract_version: 3, group_id: 'group', sender_device_identity_key: 'peer',
    library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
  markDesktopSyncGroupMemberStateReady('peer', 'normal', state);
}

function seedMembership(sqlite: Database.Database, device: 'peer' | 'local') {
  sqlite.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', ?, 'now', 'now')")
      .run(Buffer.alloc(32, 7).toString('base64url'));
  sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(device);
  sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run(`${device}-epoch`);
  sqlite.exec(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
        device_name, platform, state, joined_at, updated_at)
      VALUES ('group', 'peer', 'peer-anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
        ('group', 'local', 'local-anchor', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
}

async function pullBack(host: RequestSyncDatabaseHost, endpointUrl: string, sourcePath: string) {
  const key = { objectType: 'node', globalId: 'topic' };
  const { remote, peerState } = await runWithDatabaseConnectionOwner(async () => {
    const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    const head = textBranch('head', 'Current', textBranch('base', 'Original'));
    await applyConvergentSyncNodesWithDbPort(db, [textBranch('remote-edit', 'Remote edit', head)]);
    return { remote: await readFramedSyncInventoryEntry(db, key), peerState: loadDesktopSyncGroupMemberState() };
  });
  const local = await host.readSnapshot(db => readFramedSyncInventoryEntry(db, key));
  if (!local || !remote) throw new Error('test_entry_missing');
  const difference = compareFramedSyncInventories({ local: [local], remote: [remote] })
    .find(item => item.direction === 'remote_to_local');
  if (!difference) throw new Error('test_pull_difference_missing');
  const groupKey = new Uint8Array(32).fill(7);
  await pullDesktopRequestSyncObject(host, { difference, endpointUrl, groupKey,
    groupSecret: Buffer.from(groupKey).toString('base64url'), peerState,
    context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  await withRequestSyncReadonlySnapshot(sourcePath, async db => {
    expect(await db.query("SELECT current_version_id FROM nodes WHERE id = 'topic'"))
      .toEqual([{ current_version_id: 'remote-edit' }]);
    expect(await db.query('SELECT adopted_version_id FROM node_version_member_positions'))
      .toEqual([{ adopted_version_id: 'remote-edit' }]);
  });
}

async function assertCommitted() {
  const databasePath = await runWithDatabaseConnectionMaintenance(() => {
    const dbPath = openDatabaseConnection().dbPath;
    closeDatabaseConnection(); return dbPath;
  });
  const persisted = new Database(databasePath, { readonly: true });
  try {
    expect(persisted.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get()).toBe('head');
    expect(persisted.prepare('SELECT adopted_version_id FROM node_version_member_positions').pluck().get()).toBe('head');
    expect(persisted.prepare('SELECT library_epoch FROM node_version_device_revisions').pluck().get()).toBe('peer-epoch');
    expect(persisted.prepare('SELECT count(*) FROM sync_group_nonce_ledger').pluck().get()).toBe(1);
    for (const table of ['framed_sync_outbound_publications', 'framed_sync_inbound_transfers', 'framed_sync_receipts',
      'sync_delivery_receipts', 'node_version_inbound_receipts']) {
      expect(persisted.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeUndefined();
    }
  } finally { persisted.close(); }
  return databasePath;
}

async function startRelay(origin: string, dropResponse: boolean) {
  const server = http.createServer((request, response) => {
    const outbound = http.request(new URL(request.url ?? '/', origin), {
      method: request.method, headers: request.headers
    }, incoming => {
      if (dropResponse) { incoming.resume(); response.destroy(); return; }
      response.writeHead(incoming.statusCode ?? 500, incoming.headers);
      incoming.pipe(response);
    });
    outbound.on('error', error => response.destroy(error));
    request.pipe(outbound);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_relay_address_invalid');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function completeRound(host: RequestSyncDatabaseHost, endpointUrl: string) {
  const groupKey = new Uint8Array(32).fill(7);
  const exchange = { endpointUrl, groupKey, groupSecret: Buffer.from(groupKey).toString('base64url'),
    context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } } as const;
  await host.write(db => applyConvergentSyncNodesWithDbPort(db, [textBranch('round-edit', 'Round edit')]));
  const peerState = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroupMemberState());
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: () => exchangeDesktopRequestSyncInventory(host, exchange),
    transferObjects: differences => transferRequestSyncBatch(host, createDesktopRequestSyncExchange(exchange),
      differences, { peerState }),
    reportObjectError: (_difference, error) => { throw error; }
  });
  expect(result.complete).toBe(true);
  expect(result.pending).toBe(0);
  expect(result.transferred).toBeGreaterThan(0);
  await isolateBrokenObject(host, exchange, peerState);
}

async function isolateBrokenObject(host: RequestSyncDatabaseHost,
  exchange: Omit<Parameters<typeof postDesktopRequestSyncObject>[1], 'difference'>,
  peerState: SyncGroupMemberStatePayload) {
  await host.write(async db => {
    for (const id of ['a-broken', 'healthy']) {
      const record = textBranch(`${id}-v1`, id);
      await applyConvergentSyncNodesWithDbPort(db, [{ ...record, object_id: id,
        snapshot: { ...record.snapshot, id } }]);
    }
    await db.run("UPDATE node_sync_versions SET parent_version_id = 'missing-parent' WHERE version_id = 'a-broken-v1'");
  });
  const failures: string[] = [];
  const result = await runRequestSyncDatabaseRound({
    exchangeInventory: () => exchangeDesktopRequestSyncInventory(host, exchange),
    transferObjects: differences => transferRequestSyncBatch(host, createDesktopRequestSyncExchange(exchange),
      differences, { peerState }),
    reportObjectError: (difference, error) => {
      expect(String(error)).toContain('missing-parent');
      failures.push(difference.globalId);
    }
  });
  expect(result).toMatchObject({ complete: false, pending: 1 });
  expect(new Set(failures)).toEqual(new Set(['a-broken']));
  const databasePath = await runWithDatabaseConnectionMaintenance(() => {
    const dbPath = openDatabaseConnection().dbPath;
    closeDatabaseConnection(); return dbPath;
  });
  await withRequestSyncReadonlySnapshot(databasePath, async db => {
    expect(await db.query("SELECT id FROM nodes WHERE id IN ('a-broken', 'healthy') ORDER BY id"))
      .toEqual([{ id: 'healthy' }]);
  });
}
