// @vitest-environment node

import http from 'node:http';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import {
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_PROTOCOL_VERSION
} from '../../lib/core/sync/framedSyncContract.js';
import {
  decodeFrameHeader,
  decodeFramedSyncPreamble
} from '../../lib/core/sync/framedSyncFraming.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import {
  exchangeDesktopFramedSyncInventoryHttp,
  requestDesktopFramedSyncDifferenceHttp,
  respondDesktopFramedSyncInventory
} from './desktopFramedSyncInventoryHttp.js';
import { encryptProtocolFrame, newTransferAttempt } from './desktopFramedSyncProcessWire.js';
import { receiveDesktopFramedSyncReceipt } from './desktopFramedSyncReceiptReceiver.js';

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
      parent_version_id TEXT, host_name TEXT NOT NULL, created_at TEXT NOT NULL,
      body_text TEXT, content_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL);
    CREATE TABLE node_sync_version_parents (version_id TEXT NOT NULL,
      parent_version_id TEXT NOT NULL, ordinal INTEGER NOT NULL);
    CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY, version_id TEXT NOT NULL,
      parent_version_id TEXT, host_name TEXT NOT NULL, content_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, deleted_at TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE review_log (node_id TEXT NOT NULL, op_id TEXT NOT NULL);`);
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(statement);
  sqlite.prepare('INSERT INTO nodes VALUES (?, ?)').run(nodeId, `version-${nodeId}`);
  sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(`version-${nodeId}`, nodeId, null, 'host', '2026-10-05T00:00:00.000Z', body,
      hashByte.repeat(64), JSON.stringify(nodeSnapshot(nodeId)));
  const db = createBetterSqliteDbPort(sqlite);
  return { db, noncePort: createDesktopFramedSyncSessionNoncePort(db) };
}

function nodeSnapshot(nodeId: string) {
  const time = '2026-10-05T00:00:00.000Z';
  return {
    anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
    attachments: [], body_blob_hash: null, created_at: time, deleted_at: null,
    desired_retention: null, enable_short_term: false, hide_title_heading: false,
    id: nodeId, image_regions: null, image_sources: null, import_content_fingerprint: null,
    import_source_fingerprint: null, is_title_manual: true, kind: 'topic',
    manual_child_order: null, opening_text: null, parent_id: null, position: 0, priority: 0,
    resource_references: null, reveal: null, sequential_reading_enabled: false,
    shelved_at: null, title: nodeId, updated_at: time, virtual_filter: null
  };
}

async function commitTestReceipt(
  responder: ReturnType<typeof peer>,
  staging: ReturnType<typeof createDesktopFramedSyncStaging>,
  transferId: Uint8Array,
  requestContext = context
) {
  const publication = await staging.loadOutboundPublication(transferId);
  if (!publication) throw new Error('test_publication_missing');
  const receipt = {
    appliedStateHash: new Uint8Array(32).fill(9), contentId: publication.contentId,
    receiverDeviceId: 'device-a', receiverLibraryEpoch: 'epoch-a', transferId
  };
  const receiptAttempt = newTransferAttempt(transferId);
  const receiptFrame = await encryptProtocolFrame({
    attempt: receiptAttempt, frameType: FRAMED_SYNC_FRAME_TYPES.transferReceipt,
    groupKey, payload: receipt, payloadCase: 'transfer_receipt', sequence: 0n, transferId
  });
  await receiveDesktopFramedSyncReceipt({
    context: {
      groupId: requestContext.groupId,
      protocolVersion: requestContext.protocolVersion,
      receiverDeviceId: requestContext.responderDeviceId,
      receiverLibraryEpoch: requestContext.responderLibraryEpoch,
      senderDeviceId: requestContext.initiatorDeviceId,
      senderLibraryEpoch: requestContext.initiatorLibraryEpoch
    },
    db: responder.db, groupKey, staging,
    stream: {
      frames: (async function* () {
        yield { ciphertext: receiptFrame.ciphertext,
          header: decodeFrameHeader(receiptFrame.frameHeader), headerBytes: receiptFrame.frameHeader };
      })(),
      preamble: receiptAttempt.preamble
    },
    transferId
  });
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
          context: authenticatedContext, db: responder.db, groupKey, groupSecret,
          noncePort: responder.noncePort, staging: createDesktopFramedSyncStaging(responder.db), stream
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

it('returns an exact frozen transfer stream for a requested remote Node difference', async () => {
  const initiator = peer('node-a', 'alpha', 'a');
  const responder = peer('node-b', 'beta', 'b');
  const staging = createDesktopFramedSyncStaging(responder.db);
  const server = http.createServer((request, response) => {
    void handleCompanionLanFramedSyncPost({
      authenticate: () => ({ device_id: 'device-a', device_name: 'Device A', ok: true }),
      localIdentity: { deviceId: 'device-b', libraryEpoch: 'epoch-b' },
      onStream: ({ context: authenticatedContext, stream }) =>
        respondDesktopFramedSyncInventory({
          context: authenticatedContext, db: responder.db, groupKey, groupSecret,
          noncePort: responder.noncePort, staging, stream
        }),
      request,
      response
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_invalid');
  const endpointUrl = `http://127.0.0.1:${address.port}`;
  const inventory = await exchangeDesktopFramedSyncInventoryHttp({
    context, db: initiator.db, endpointUrl, groupKey, groupSecret, noncePort: initiator.noncePort
  });
  const difference = compareFramedSyncInventories({
    local: inventory.local, remote: inventory.remote
  }).find((value) => value.direction === 'remote_to_local');
  if (!difference) throw new Error('test_remote_difference_missing');

  const transfer = await requestDesktopFramedSyncDifferenceHttp({
    context, difference, endpointUrl, groupKey, groupSecret,
    noncePort: initiator.noncePort, roundId: inventory.roundId
  });

  expect(decodeFramedSyncPreamble(transfer.preamble).contextKind).toBe('transfer');
  const frameTypes: number[] = [];
  for await (const frame of transfer.frames) frameTypes.push(frame.header.frameType);
  expect(frameTypes).toEqual([2, 3, 4, 5]);
  expect((await responder.db.query<{ state: string }>(
    'SELECT state FROM framed_sync_outbound_attempts'
  ))[0]?.state).toBe('replayable');

  const transferId = decodeFramedSyncPreamble(transfer.preamble).contextId;
  await expect(commitTestReceipt(responder, staging, transferId, {
    ...context, initiatorDeviceId: 'device-c'
  })).rejects.toThrow('framed_sync_receipt_request_context_mismatch');
  await commitTestReceipt(responder, staging, transferId);
  expect((await responder.db.query<{ state: string }>(
    'SELECT state FROM framed_sync_outbound_publications'
  ))[0]?.state).toBe('receipt_committed');
  expect((await responder.db.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM framed_sync_outbound_holds'
  ))[0]?.count).toBe(0);
});
