import { mkdir, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import Database from 'better-sqlite3';
import { vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance,
  runWithDatabaseConnectionOwner } from '../database/connection.js';
import { withRequestSyncReadonlySnapshot } from '../database/requestSyncReadonlySnapshot.js';

import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';
import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { prepareDesktopFlowIndexForSync } from './desktopNodeIndexSync.testSupport.js';
import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { seedMembership } from './desktopRequestSyncObjectHttp.testSupport.js';
import { clearDesktopSyncGroupMemberStateReadiness, markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
export const peerState = (id: string) => ({ contract_version: 3 as const, group_id: 'group',
  sender_device_identity_key: id, library_epoch: `${id}-epoch`, proof_revision: 0,
  source_proof_revisions: {}, devices: [], removals: [], restore: null });

export async function preparationHttpFixture(root: string) {
  await mkdir(root, { recursive: true });
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(root, 'target'));
  const sourcePath = path.join(root, 'source.db');
  const source = new Database(sourcePath);
  source.pragma('journal_mode = WAL');
  initializeDatabaseSchema(source);
  seedMembership(source, 'peer');
  const sourceDb = createBetterSqliteDbPort(source);
  const host: RequestSyncDatabaseHost = { files: createDesktopFramedSyncFiles(path.join(root, 'source-files')),
    readSnapshot: (read, signal) => withRequestSyncReadonlySnapshot(sourcePath, read, signal),
    write: write => sourceDb.transaction(write) };
  const targetPath = await runWithDatabaseConnectionOwner(() => {
    const { sqlite, dbPath } = openDatabaseConnection();
    initializeDatabaseSchema(sqlite);
    seedMembership(sqlite, 'local');
    return dbPath;
  });
  markDesktopSyncGroupMemberStateReady('peer', 'normal', peerState('peer'));
  await prepareDesktopFlowIndexForSync();
  const target = createDesktopRequestSyncDatabaseHost(targetPath);
  const server = http.createServer((request, response) => {
    void handleProductionCompanionFramedSyncPost({ deviceId: 'local', request, response })
      .catch(error => response.writeHead(500).end(String(error)));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_address_invalid');
  const groupKey = new Uint8Array(32).fill(7);
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'peer', initiatorLibraryEpoch: 'peer-epoch',
    responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;
  const exchangeOptions = { context, groupKey,
    groupSecret: Buffer.from(groupKey).toString('base64url'), endpointUrl: `http://127.0.0.1:${address.port}` };
  const exchange = createDesktopRequestSyncExchange(exchangeOptions);
  return { exchangeOptions, source, sourceDb, sourcePath, host, target, targetPath, exchange,
    async close() {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
      clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
      source.close(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true });
    } };
}
