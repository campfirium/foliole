// @vitest-environment node

import http from 'node:http';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import {
  exchangeDesktopFramedSyncInventoryHttp,
  respondDesktopFramedSyncInventory
} from './desktopFramedSyncInventoryHttp.js';

const databases: Database.Database[] = [];
const servers: http.Server[] = [];
const groupSecret = Buffer.alloc(32, 8).toString('base64url');
const groupKey = new Uint8Array(Buffer.from(groupSecret, 'base64url'));
const context = {
  groupId: 'group-a',
  initiatorDeviceId: 'device-a',
  initiatorLibraryEpoch: 'epoch-a',
  protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  responderDeviceId: 'device-b',
  responderLibraryEpoch: 'epoch-b'
} as const;

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
  databases.splice(0).forEach((database) => database.close());
});

function peer(nodeId: string, body: string, hashByte: string) {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT NOT NULL);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL,
      body_text TEXT, content_hash TEXT NOT NULL);
    CREATE TABLE node_sync_version_parents (version_id TEXT NOT NULL,
      parent_version_id TEXT NOT NULL, ordinal INTEGER NOT NULL);
    CREATE TABLE review_log (node_id TEXT NOT NULL, op_id TEXT NOT NULL);`);
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(statement);
  sqlite.prepare('INSERT INTO nodes VALUES (?, ?)').run(nodeId, `version-${nodeId}`);
  sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?)')
    .run(`version-${nodeId}`, nodeId, body, hashByte.repeat(64));
  const db = createBetterSqliteDbPort(sqlite);
  return { db, noncePort: createDesktopFramedSyncSessionNoncePort(db) };
}

it('exchanges authenticated encrypted inventories over the production binary HTTP shape', async () => {
  const initiator = peer('node-a', 'alpha', 'a');
  const responder = peer('node-b', 'beta', 'b');
  const server = http.createServer((request, response) => {
    void handleCompanionLanFramedSyncPost({
      authenticate: () => ({ device_id: 'device-a', device_name: 'Device A', ok: true }),
      localIdentity: { deviceId: 'device-b', libraryEpoch: 'epoch-b' },
      onStream: ({ context: authenticatedContext, stream }) =>
        respondDesktopFramedSyncInventory({
          context: authenticatedContext, db: responder.db, groupKey,
          noncePort: responder.noncePort, stream
        }),
      request,
      response
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_invalid');

  const result = await exchangeDesktopFramedSyncInventoryHttp({
    context,
    db: initiator.db,
    endpointUrl: `http://127.0.0.1:${address.port}`,
    groupKey,
    groupSecret,
    noncePort: initiator.noncePort
  });

  expect(result.local.map((entry) => entry.globalId)).toEqual(['node-a']);
  expect(result.remote.map((entry) => entry.globalId)).toEqual(['node-b']);
  expect(result.roundId).toHaveLength(16);
});
