import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getPeerCursor, setPeerCursor } from '../../lib/core/database/syncState.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import type { CompanionWorkspacePairPayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import type { SyncGroupLibraryFacts } from '../../lib/platform/syncGroupContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { joinDesktopSyncGroup, loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveDesktopDeviceName } from './companionLanPayloads.js';
import { refreshCompanionMdnsAdvertisement } from './companionMdnsAdvertisement.js';
import { loadPairedSyncGroupPeers, savePairedSyncGroupPeer } from './companionPairingStore.js';
import { registerPairedCompanionDeviceWithSecret } from './companionPairingStore.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { createDesktopSyncGroupSignedHeaders, requestJson } from './desktopSyncGroupHttp.js';
import { refreshDesktopSyncGroupPendingJoinFromDiscovery } from './desktopSyncGroupJoinEndpoint.js';
import { loadDesktopSyncGroupJoinState, saveDesktopSyncGroupPendingJoin } from './desktopSyncGroupJoinState.js';
import { createDesktopSyncGroupPairingKey, decryptDesktopSyncGroupPairingSecret } from './desktopSyncGroupPairingCrypto.js';
import { runDesktopSyncGroupPeerSingleFlight } from './desktopSyncGroupPeerSingleFlight.js';
import {
  assertDesktopSyncGroupResourcesComplete,
  downloadDesktopSyncGroupResources
} from './desktopSyncGroupResources.js';
import { extractSyncPackDatabase } from './syncPackContainerReader.js';

const JOIN_APPROVAL_POLL_MS = 1_500;
let joinApprovalTimer: NodeJS.Timeout | null = null;
let joinCompletionExecutor: (() => Promise<unknown>) | null = null;
let joinCompletionInFlight: Promise<ReturnType<typeof loadDesktopSyncGroup>> | null = null;

export function setDesktopSyncGroupJoinCompletionExecutor(execute: (() => Promise<unknown>) | null) {
  joinCompletionExecutor = execute;
}

export async function requestDesktopSyncGroupJoin(endpointUrl: string) {
  const state = loadDesktopSyncGroupJoinState();
  const candidate = state.candidates.find((item) => item.endpoint_url === endpointUrl);
  if (!candidate) throw new Error('sync_group_candidate_not_found');
  const facts = loadDesktopLibraryFacts();
  const existingGroup = loadDesktopSyncGroup();
  const isActiveSameGroup = existingGroup?.local_member_state === 'active'
    && existingGroup.group_id === candidate.group_id
    && existingGroup.timeline_id === candidate.timeline_id;
  if (!isActiveSameGroup && !isEmpty(facts)) throw new Error('sync_group_requires_empty_library');
  const key = await createDesktopSyncGroupPairingKey();
  const deviceId = loadOrCreateDesktopDeviceId();
  const payload = await requestJson(`${endpointUrl}/companion/pair-requests`, {
    body: JSON.stringify({
      device_id: deviceId, device_kind: process.platform, device_name: resolveDesktopDeviceName(),
      group_id: candidate.group_id, library_facts: facts, pairing_public_key: key.publicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR, timeline_id: candidate.timeline_id
    }), headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  saveDesktopSyncGroupPendingJoin({
    candidate, key,
    request: {
      endpoint_url: endpointUrl, expires_at: String(payload.expires_at), group_id: candidate.group_id,
      pair_request_id: String(payload.pair_request_id), status: 'pending', timeline_id: candidate.timeline_id
    }
  });
  scheduleJoinCompletion();
}

export async function completeDesktopSyncGroupJoin() {
  if (joinCompletionInFlight) return await joinCompletionInFlight;
  const work = completeDesktopSyncGroupJoinOnce().finally(() => {
    if (joinCompletionInFlight === work) joinCompletionInFlight = null;
  });
  joinCompletionInFlight = work;
  return await work;
}

async function completeDesktopSyncGroupJoinOnce() {
  const pending = loadDesktopSyncGroupJoinState().pending;
  if (!pending) throw new Error('sync_group_join_not_pending');
  const payload = await requestJson(`${pending.candidate.endpoint_url}/companion/pair`, {
    body: JSON.stringify({ pair_request_id: pending.request.pair_request_id }),
    headers: { 'Content-Type': 'application/json' }, method: 'POST'
  }) as unknown as CompanionWorkspacePairPayload;
  if (!payload.sync_group) throw new Error('sync_group_membership_invalid');
  const secret = await decryptDesktopSyncGroupPairingSecret(pending.key.privateKey, payload.encrypted_device_secret);
  if (!payload.provider_encrypted_device_secret || !payload.provider_device_id ||
      !payload.provider_device_kind || !payload.provider_device_name) {
    throw new Error('sync_group_provider_pairing_invalid');
  }
  const providerSecret = await decryptDesktopSyncGroupPairingSecret(
    pending.key.privateKey, payload.provider_encrypted_device_secret
  );
  const localDeviceId = payload.device_id.trim();
  if (!localDeviceId) throw new Error('sync_group_membership_invalid');
  const peer = savePairedSyncGroupPeer({
    endpoint_url: pending.candidate.endpoint_url, group_id: pending.candidate.group_id,
    local_device_id: localDeviceId, peer_device_id: pending.candidate.provider_device_id,
    peer_device_kind: pending.candidate.provider_device_kind, peer_device_name: pending.candidate.provider_device_name,
    secret, timeline_id: pending.candidate.timeline_id
  });
  registerPairedCompanionDeviceWithSecret({
    deviceId: payload.provider_device_id, deviceKind: payload.provider_device_kind,
    deviceName: payload.provider_device_name, deviceSecret: providerSecret,
    negotiatedProtocolVersion: 1, pairedAt: payload.paired_at,
    remoteProtocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
  });
  if (!loadDesktopSyncGroup()) joinDesktopSyncGroup({ deviceId: localDeviceId, group: payload.sync_group });
  saveDesktopSyncGroupPendingJoin(null);
  await continueDesktopSyncGroupSync(peer).catch((error) => {
    console.info('[sync-group] initial sync waiting for provider', {
      error: error instanceof Error ? error.message : String(error), peerDeviceId: peer.peer_device_id
    });
  });
  return loadDesktopSyncGroup();
}

export async function continueDesktopSyncGroupSync(peer?: ReturnType<typeof savePairedSyncGroupPeer>) {
  if (!isDesktopCompanionSyncParticipating()) throw new Error('sync_participation_inactive');
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const target = peer ?? loadPairedSyncGroupPeers(group.group_id)[0];
  if (!target) return null;
  return runDesktopSyncGroupPeerSingleFlight(target.peer_device_id, () => continuePeerSync(target));
}

async function continuePeerSync(target: ReturnType<typeof savePairedSyncGroupPeer>) {
  const cursor = loadReceiveCursor(target.peer_device_id);
  const nextCursor = await runPeerSyncStage('sync_pack', () => downloadAndApply(target, cursor));
  saveReceiveCursor(target.peer_device_id, nextCursor);
  console.info('[sync-group] receive cursor committed', {
    cursor: nextCursor, peerDeviceId: target.peer_device_id
  });
  await runPeerSyncStage('resources', () => downloadDesktopSyncGroupResources(target));
  const complete = resourcesComplete();
  refreshCompanionMdnsAdvertisement();
  return { complete, cursor: nextCursor };
}

async function runPeerSyncStage<T>(stage: 'resources' | 'sync_pack', execute: () => Promise<T>) {
  try {
    return await execute();
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `; cause=${error.cause.message}` : '';
    const detail = `${error instanceof Error ? error.message : String(error)}${cause}`;
    throw new Error(`sync_group_${stage}_failed: ${detail}`, { cause: error });
  }
}

async function downloadAndApply(peer: ReturnType<typeof savePairedSyncGroupPeer>, after: number) {
  const pathWithQuery = `/companion/sync-pack?after_state_seq=${after}`;
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    headers: createDesktopSyncGroupSignedHeaders({ groupId: peer.group_id, localDeviceId: peer.local_device_id,
      method: 'GET', pathWithQuery, secret: peer.secret })
  });
  if (!response.ok) throw new Error(`sync_pack_http_${response.status}`);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-initial-sync-'));
  const incomingPath = path.join(tempRoot, 'incoming.db');
  try {
    const manifest = await extractSyncPackDatabase({
      body: Buffer.from(await response.arrayBuffer()),
      expectedPeerId: peer.local_device_id,
      expectedSourcePeerId: peer.peer_device_id,
      outputPath: incomingPath
    });
    const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-group-initial-sync' });
    await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
    try {
      await applySyncPackNodeSurfaceWithDbPort(port, {
        currentCursor: after,
        deviceId: peer.local_device_id,
        incomingAlias: 'inc',
        sourcePeerId: peer.peer_device_id
      });
    } finally { await port.run('DETACH DATABASE inc'); }
    return manifest.toStateSeq;
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
}

function loadReceiveCursor(peerDeviceId: string) {
  const value = getPeerCursor(openDatabaseConnection().driver, peerDeviceId, 'state');
  const cursor = Number.parseInt(value ?? '0', 10);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
}

function saveReceiveCursor(peerDeviceId: string, cursor: number) {
  setPeerCursor(openDatabaseConnection().driver, peerDeviceId, 'state', String(cursor), new Date().toISOString());
}

function resourcesComplete() {
  try {
    assertDesktopSyncGroupResourcesComplete();
    return true;
  } catch {
    return false;
  }
}

function loadDesktopLibraryFacts(): SyncGroupLibraryFacts {
  const driver = openDatabaseConnection().driver;
  const count = (table: string) => Number(driver.queryOne<{ value: number }>(`SELECT COUNT(*) AS value FROM ${table}`)?.value ?? 0);
  const nodeCount = Number(driver.queryOne<{ value: number }>(
    "SELECT COUNT(*) AS value FROM nodes WHERE id NOT IN ('special-inbox', 'special-virtual-root')"
  )?.value ?? 0);
  return { attachment_count: count('attachments'), content_blob_count: count('content_blobs'), node_count: nodeCount,
    review_log_count: count('review_log'), timeline_id: null };
}

function isEmpty(facts: SyncGroupLibraryFacts) {
  return facts.attachment_count === 0 && facts.content_blob_count === 0 && facts.node_count === 0 && facts.review_log_count === 0 && facts.timeline_id === null;
}

function scheduleJoinCompletion() {
  if (joinApprovalTimer) clearTimeout(joinApprovalTimer);
  joinApprovalTimer = setTimeout(() => {
    joinApprovalTimer = null;
    const execute = joinCompletionExecutor ?? completeDesktopSyncGroupJoin;
    void execute().catch(async (error) => {
      const pending = loadDesktopSyncGroupJoinState().pending;
      if (!pending) return;
      console.info('[sync-group] join completion waiting', {
        error: error instanceof Error ? error.message : String(error)
      });
      if (error instanceof Error && error.message === 'pair_request_rejected') {
        saveDesktopSyncGroupPendingJoin(null);
        return;
      }
      if (error instanceof TypeError) {
        await refreshDesktopSyncGroupPendingJoinFromDiscovery().catch(() => false);
      }
      if (Date.parse(pending.request.expires_at) > Date.now()) scheduleJoinCompletion();
    });
  }, JOIN_APPROVAL_POLL_MS);
  joinApprovalTimer.unref();
}
