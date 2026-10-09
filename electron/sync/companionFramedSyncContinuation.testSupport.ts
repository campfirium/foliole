import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';

import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import type { NativeCompanionFramedSyncPullRequest, NativeCompanionFramedSyncTransferRequest }
  from '../../lib/platform/nativeCompanionSyncContract.js';
import { prepareCompanionFramedSyncOutbound } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncOutbound.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

import { receiveDesktopFramedSyncRoundStream } from './desktopFramedSyncInboundRound.js';
import { exchangeDesktopFramedSyncInventoryHttp, requestDesktopFramedSyncDifferenceHttp }
  from './desktopFramedSyncInventoryHttp.js';
import { prepareDesktopFramedSyncPublishedDelivery, sendDesktopFramedSyncPublishedTransfer }
  from './desktopFramedSyncProcessOutbound.js';
import type { DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

/** Replace the unavailable OS bridge with production authenticated HTTP and SQLite transports. */
export function companionContinuationBridge(local: DesktopFramedSyncFixtureSnapshot,
  remote: DesktopFramedSyncFixtureSnapshot) {
  const sqlite = new Database(local.databasePath);
  sqlite.exec('CREATE TABLE IF NOT EXISTS companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ? WHERE singleton_id = 1')
    .run(`${local.deviceId}-epoch`);
  const db = createBetterSqliteDbPort(sqlite);
  const staging = createDesktopFramedSyncStaging(db);
  const groupKey = new Uint8Array(32).fill(7);
  const groupSecret = Buffer.from(groupKey).toString('base64url');
  const context = { groupId: 't326-group', protocolVersion: 22 as const,
    initiatorDeviceId: local.deviceId, initiatorLibraryEpoch: `${local.deviceId}-epoch`,
    responderDeviceId: remote.deviceId, responderLibraryEpoch: `${remote.deviceId}-epoch` };
  const exchange = { context, db, endpointUrl: remote.origin, groupKey, groupSecret,
    noncePort: createDesktopFramedSyncSessionNoncePort(db) };
  let remoteEntries: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>['remote'] = [];
  const request = { endpoint_url: remote.origin, receiver_device_id: remote.deviceId,
    receiver_library_epoch: `${remote.deviceId}-epoch`, sync_group_id: 't326-group' };
  async function readInventory() {
    context.initiatorLibraryEpoch = readLocalEpoch(sqlite);
    const inventory = await exchangeDesktopFramedSyncInventoryHttp(exchange);
    remoteEntries = inventory.remote;
    return { round_id: bytesToHex(inventory.roundId), entries: remoteEntries.map(serialize) };
  }
  async function pull(input: NativeCompanionFramedSyncPullRequest) {
    context.initiatorLibraryEpoch = readLocalEpoch(sqlite);
    const sourceSnapshot = remoteEntries.find(entry => entry.globalId === input.object_id && entry.objectType === input.object_type);
    if (!sourceSnapshot) throw new Error('fixture_remote_entry_missing');
    const difference = { direction: 'remote_to_local' as const, globalId: input.object_id,
      objectType: input.object_type, sourceSnapshot, need: { sharedState: true,
        frontierFactIds: input.frontier_fact_ids, requiredRelationIds: input.required_relation_ids,
        reviewFactIds: input.review_fact_ids, resourceHashes: input.resource_hashes.map(hexToBytes),
        stateFactIds: input.state_fact_ids } };
    const inbound = { ...exchange, roundId: hexToBytes(input.round_id), staging };
    const stream = await requestDesktopFramedSyncDifferenceHttp({ ...inbound, difference });
    await receiveDesktopFramedSyncRoundStream(inbound, stream, difference);
    return nativeReceipt(decodeFramedSyncPreamble(stream.preamble).contextId);
  }
  async function send(input: NativeCompanionFramedSyncTransferRequest) {
    context.initiatorLibraryEpoch = readLocalEpoch(sqlite);
    const prepared = await prepareCompanionFramedSyncOutbound(db, { ...input, group_id: input.sync_group_id,
      sender_device_id: local.deviceId, sender_library_epoch: context.initiatorLibraryEpoch });
    const publication = await staging.loadOutboundPublication(hexToBytes(prepared.transfer_id));
    if (!publication) throw new Error('fixture_publication_missing');
    const delivery = await prepareDesktopFramedSyncPublishedDelivery({ db, staging, groupSecret, publication });
    await sendDesktopFramedSyncPublishedTransfer({ db, staging, groupSecret, publication,
      peerOrigin: input.endpoint_url, ...delivery });
    return nativeReceipt(publication.transferId);
  }
  async function nativeReceipt(id: Uint8Array) {
    const receipt = await staging.loadReceipt(id);
    if (!receipt) throw new Error('fixture_receipt_missing');
    return { transfer_id: bytesToHex(id), content_id: bytesToHex(receipt.contentId),
      applied_state_hash: bytesToHex(receipt.appliedStateHash), receiver_device_id: receipt.receiverDeviceId,
      receiver_library_epoch: receipt.receiverLibraryEpoch };
  }
  return { db, sqlite, request, readInventory, pull, send };
}

function readLocalEpoch(sqlite: Database.Database) {
  const epoch = sqlite.prepare('SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1')
    .pluck().get();
  if (typeof epoch !== 'string') throw new Error('fixture_local_epoch_missing');
  return epoch;
}

function serialize(entry: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>['remote'][number]) {
  return { frontier_fact_ids: entry.frontierFactIds, global_id: entry.globalId, object_type: entry.objectType,
    required_relation_ids: entry.requiredRelationIds, resource_hashes: entry.resourceHashes.map(bytesToHex),
    review_fact_ids: entry.reviewFactIds, state_fact_ids: entry.stateFactIds ?? [], shared_state_hash: bytesToHex(entry.sharedStateHash) };
}
