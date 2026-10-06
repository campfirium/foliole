import path from 'node:path';

import Database from 'better-sqlite3';
import { z } from 'zod';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { beginSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';
import { prepareCompanionFramedSyncTransfer }
  from '../../src/shared/platform/companion/sync/framed/companionFramedSyncApply.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { exchangeDesktopFramedSyncInventoryHttp, requestDesktopFramedSyncDifferenceHttp }
  from './desktopFramedSyncInventoryHttp.js';
import { buildReceiptStream, readReceipt } from './desktopFramedSyncProcessReceipt.js';
import { stageDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import type { DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

const storedTransfer = z.object({ transfer_id: z.instanceof(Uint8Array),
  sender_device_id: z.string(), sender_library_epoch: z.string(),
  receiver_device_id: z.string(), receiver_library_epoch: z.string() });

export async function openCompanionAdoptionFixture(root: string, source: DesktopFramedSyncFixtureSnapshot) {
  const mainPath = path.join(root, 'companion.db');
  const stagingPath = path.join(root, 'companion-staging.db');
  let main = new Database(mainPath);
  let native = new Database(stagingPath);
  let db = createBetterSqliteDbPort(main);
  await bootstrapCompanionDatabase(db, { allowCreate: true, expectedHostName: 'Companion', now: '2026-10-07' });
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) native.exec(statement);
  installAuthenticatedStagingViews(native);
  main.prepare('ATTACH DATABASE ? AS source_members').run(source.databasePath);
  main.exec(`INSERT INTO sync_groups SELECT * FROM source_members.sync_groups;
    INSERT INTO sync_group_devices SELECT * FROM source_members.sync_group_devices;`);
  main.exec('DETACH DATABASE source_members');
  main.prepare(`INSERT INTO sync_group_local_state VALUES (1, 't326-group', 'desktop-b', 'active', 'now')`).run();
  const adoption = { endpointUrl: source.origin, groupId: 't326-group', libraryEpoch: 'desktop-b-epoch',
    providerDeviceId: source.deviceId, providerDeviceName: 'Provider', providerPlatform: 'darwin' };
  main.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('old-local', 'topic', 'Old local', 'Protected until complete adoption', 'now', 'now')`).run();
  await db.transaction((tx) => beginSyncGroupLocalAdoption(tx, adoption));
  const context = { groupId: adoption.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'desktop-b', initiatorLibraryEpoch: adoption.libraryEpoch,
    responderDeviceId: source.deviceId, responderLibraryEpoch: `${source.deviceId}-epoch` } satisfies Parameters<typeof exchangeDesktopFramedSyncInventoryHttp>[0]['context'];
  const groupKey = new Uint8Array(32).fill(7);
  const runtime = () => ({ context, db, endpointUrl: source.origin, groupKey,
    groupSecret: Buffer.from(groupKey).toString('base64url'),
    noncePort: createDesktopFramedSyncSessionNoncePort(db) });
  return {
    adoption, get db() { return db; }, get main() { return main; }, mainPath, stagingPath,
    async inventory() {
      const inventory = await exchangeDesktopFramedSyncInventoryHttp(runtime());
      return { ...inventory, differences: compareFramedSyncInventories({ local: [], remote: inventory.remote }) };
    },
    async stage(inventory: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>,
      difference: ReturnType<typeof compareFramedSyncInventories>[number]) {
      const stream = await requestDesktopFramedSyncDifferenceHttp({ ...runtime(), difference,
        roundId: inventory.roundId });
      return stageDesktopFramedSyncTransfer({ db: createBetterSqliteDbPort(native), groupKey, stream,
        staging: createDesktopFramedSyncStaging(createBetterSqliteDbPort(native)), context: {
          groupId: context.groupId, protocolVersion: context.protocolVersion,
          senderDeviceId: context.responderDeviceId, senderLibraryEpoch: context.responderLibraryEpoch,
          receiverDeviceId: context.initiatorDeviceId, receiverLibraryEpoch: context.initiatorLibraryEpoch
        } });
    },
    prepare: () => prepareAuthenticatedTransfers({ db, native, stagingPath }),
    acknowledge: (receipt: TransferReceiptStage) => acknowledgeDelivery({ db, groupKey, receipt, source }),
    reopen() {
      main.close(); native.close(); main = new Database(mainPath); native = new Database(stagingPath);
      db = createBetterSqliteDbPort(main);
    },
    close() { main.close(); native.close(); }
  };
}

async function acknowledgeDelivery(input: {
  db: ReturnType<typeof createBetterSqliteDbPort>; groupKey: Uint8Array;
  receipt: TransferReceiptStage; source: DesktopFramedSyncFixtureSnapshot;
}) {
  const { db, groupKey, receipt, source } = input;
  const body = await buildReceiptStream({ db, groupKey, receipt, staging: createDesktopFramedSyncStaging(db) });
  const context = { groupId: 't326-group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: source.deviceId, senderLibraryEpoch: `${source.deviceId}-epoch`,
    receiverDeviceId: receipt.receiverDeviceId, receiverLibraryEpoch: receipt.receiverLibraryEpoch } satisfies Parameters<typeof readReceipt>[0]['published']['context'];
  const response = await postDesktopFramedSync({ body, endpointUrl: source.origin,
    groupId: context.groupId, localDeviceId: receipt.receiverDeviceId,
    localLibraryEpoch: receipt.receiverLibraryEpoch, remoteDeviceId: context.senderDeviceId,
    remoteLibraryEpoch: context.senderLibraryEpoch, pathWithQuery: '/companion/framed-sync',
    secret: Buffer.from(groupKey).toString('base64url') });
  return readReceipt({ groupKey, stream: response.stream, published: {
    context, transferId: receipt.transferId, contentId: receipt.contentId, manifestHash: receipt.contentId,
    factCount: 0n, blobCount: 0n, totalBlobBytes: 0n
  } });
}

async function prepareAuthenticatedTransfers(input: {
  db: ReturnType<typeof createBetterSqliteDbPort>; native: Database.Database; stagingPath: string;
}) {
  const { db, native, stagingPath } = input;
  const transfers = z.array(storedTransfer).parse(native.prepare(
    "SELECT * FROM framed_sync_inbound_transfers WHERE state = 'ready_to_apply' ORDER BY transfer_id"
  ).all());
  const prepared = [];
  for (const transfer of transfers) prepared.push(await prepareCompanionFramedSyncTransfer(db, {
    stagingKind: 'ios', stagingPath, transferId: transfer.transfer_id,
    senderDeviceId: transfer.sender_device_id, senderLibraryEpoch: transfer.sender_library_epoch,
    receiverDeviceId: transfer.receiver_device_id, receiverLibraryEpoch: transfer.receiver_library_epoch,
    resourceStorageKeys: []
  }));
  return prepared.sort((left, right) =>
    compareSyncIdentityText(left.decoded.objectType, right.decoded.objectType) ||
    compareSyncIdentityText(left.decoded.globalId, right.decoded.globalId));
}

function installAuthenticatedStagingViews(sqlite: Database.Database) {
  const names = { transfers: 'inbound_transfers', frames: 'inbound_frames',
    available_blobs: 'available_blobs', blob_pins: 'blob_pins',
    available_resources: 'available_resources', resource_pins: 'resource_pins' };
  // Only expose the native SQL read contract; HTTP authentication and durable staging remain production code.
  for (const [name, source] of Object.entries(names)) sqlite.exec(
    `CREATE VIEW framed_sync_ios_${name} AS SELECT * FROM framed_sync_${source}`
  );
}
