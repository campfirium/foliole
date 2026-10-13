import { mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import http from 'node:http';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../../electron/database/connection.js';
import { migrateDesktopHostProfile } from '../../electron/database/hostProfile.js';
import { withRequestSyncReadonlySnapshot } from '../../electron/database/requestSyncReadonlySnapshot.js';
import { createDesktopFramedSyncFiles } from '../../electron/sync/desktopFramedSyncFiles.js';
import { createDesktopRequestSyncExchange } from '../../electron/sync/desktopRequestSyncExchange.js';
import { exchangeDesktopRequestSyncInventory } from '../../electron/sync/desktopRequestSyncInventoryHttp.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { transferRequestSyncBatch } from '../../lib/core/sync/requestSyncBatchExchange.js';
import { runRequestSyncDatabaseRound } from '../../lib/core/sync/requestSyncDatabaseRound.js';
import { IOS_HOSTED_PROVIDER_DEVICE_ID, IOS_HOSTED_SYNC_GROUP_ID } from '../../lib/platform/iosHostedSyncGroupContract.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { openDesktopAttachmentBlockReceiver } from '../../electron/sync/desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from '../../electron/sync/desktopAttachmentBlockSource.js';
import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { readRequestSyncAttachmentNeeds } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { createIosHostedRequestLibrary } from './ios-hosted-request-library.ts';
import { createIosHostedRequestScenario } from './ios-hosted-request-scenario.ts';
import { createIosSyncPackAcceptanceObservations } from './ios-sync-pack-acceptance-observations.ts';

export async function scenarioFixture(root, options) {
  const groupKey = new Uint8Array(32).fill(7), secret = Buffer.from(groupKey).toString('base64url');
  const device = { device_anchor: 'b1111111-1111-4111-8111-111111111111', canonical_library_path: '/acceptance/phone.db',
    path_flavor: 'posix', device_name: 'Phone', platform: 'ios-capacitor' };
  const phoneId = createSyncGroupDeviceIdentity({ group_id: IOS_HOSTED_SYNC_GROUP_ID, device_anchor: device.device_anchor,
    library_path: device.canonical_library_path, path_flavor: device.path_flavor }).identity_key;
  const databasePath = await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection(); initializeDatabaseSchema(connection.sqlite);
    migrateDesktopHostProfile(connection, 'acceptance-desktop');
    bindParentOrderWriter(connection.driver, { deviceAnchor: 'acceptance-desktop', libraryPath: connection.dbPath });
    return connection.dbPath;
  });
  const library = await createIosHostedRequestLibrary({ databasePath, workgroupKey: secret });
  await library.registerAcceptedDevice(device);
  const providerState = await library.memberState();
  const phonePath = path.join(root, 'phone.db'), phone = new Database(phonePath);
  phone.pragma('journal_mode = WAL'); initializeDatabaseSchema(phone);
  seedPhoneMembership(phone, providerState, phoneId, secret);
  const db = createBetterSqliteDbPort(phone);
  const host = { files: createDesktopFramedSyncFiles(path.join(root, 'phone-files')),
    readSnapshot: (read, signal) => withRequestSyncReadonlySnapshot(phonePath, read, signal), write: write => write(db) };
  const observations = createIosSyncPackAcceptanceObservations();
  const route = createIosHostedRequestScenario(IOS_HOSTED_PROVIDER_DEVICE_ID, observations, options);
  let completion = Promise.resolve();
  const server = http.createServer((request, response) => {
    completion = route(request, response).catch(error => { response.destroy(error); throw error; });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpointUrl = `http://127.0.0.1:${server.address().port}`;
  let lastExchange;
  async function round() {
    const proof = phone.prepare('SELECT library_epoch,proof_revision FROM node_version_local_proof_state').get();
    const current = await library.memberState();
    const accepted = await library.acceptMemberState(JSON.stringify({ ...current,
      sender_device_identity_key: phoneId, library_epoch: proof.library_epoch, proof_revision: proof.proof_revision }), phoneId);
    if (!accepted.normalSyncReady) throw new Error('fixture_member_not_ready');
    const exchange = { endpointUrl, groupKey, groupSecret: secret, context: {
      groupId: IOS_HOSTED_SYNC_GROUP_ID, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: phoneId, initiatorLibraryEpoch: proof.library_epoch,
      responderDeviceId: IOS_HOSTED_PROVIDER_DEVICE_ID, responderLibraryEpoch: accepted.state.library_epoch
    } };
    lastExchange = exchange;
    const result = await runRequestSyncDatabaseRound({
      exchangeInventory: () => exchangeDesktopRequestSyncInventory(host, exchange),
      transferObjects: differences => transferRequestSyncBatch(host, createDesktopRequestSyncExchange(exchange), differences,
        { peerState: accepted.state }),
      reportObjectError: (_difference, error) => { throw error; }
    });
    await completion;
    return result;
  }
  return { phone, db, observations, round, attachments: () => phoneAttachments({ root, db, host, exchange: lastExchange }), async close() {
    await new Promise(resolve => server.close(resolve)); phone.close();
  } };
}

function seedPhoneMembership(phone, state, phoneId, secret) {
  phone.prepare('INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?)').run(state.group_id, 'Acceptance', secret, 'now', 'now');
  phone.prepare('INSERT INTO sync_group_local_state VALUES (1, ?, ?, ?, ?)').run(state.group_id, phoneId, 'active', 'now');
  phone.prepare('UPDATE node_version_local_proof_state SET library_epoch=?').run('phone-epoch');
  for (const device of state.devices) phone.prepare(`INSERT INTO sync_group_devices
    (group_id,device_identity_key,device_anchor,canonical_library_path,device_name,platform,state,joined_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(state.group_id, device.device_identity_key, device.device_anchor,
      device.canonical_library_path, device.device_name, device.platform, device.state, device.joined_at, device.updated_at);
  phone.prepare(`INSERT INTO nodes(id,kind,title,content,created_at,updated_at)
    VALUES ('special-inbox','folder','Inbox','','2026-07-21','2026-07-21')`).run();
}

async function phoneAttachments({ root, db, host, exchange }) {
  if (!exchange) throw new Error('fixture_member_exchange_required');
  const assetsDir = path.join(root, 'phone', 'Assets');
  await mkdir(assetsDir, { recursive: true });
  const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: path.dirname(assetsDir), assetsDir,
    availability: (hash, available) => recordFramedSyncResourceAvailability(db, [hash], available) });
  if (receiver.kind !== 'acquired') throw new Error('fixture_attachment_owner_busy');
  try {
    const failures = [];
    const result = await exchangeRequestSyncAttachments({ ...receiver, ...createDesktopAttachmentBlockSource(assetsDir),
      needs: () => readRequestSyncAttachmentNeeds(host, key => isDesktopAttachmentPresent(assetsDir, key))
    }, createDesktopRequestSyncExchange(exchange), (key, error) => failures.push({ key, error: String(error) }));
    return { assetsDir, failures, result };
  } finally { await receiver.close(); }
}
