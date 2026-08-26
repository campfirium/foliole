import type { CompanionWorkspacePairPayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import type { SyncGroupLibraryFacts } from '../../lib/platform/syncGroupContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { joinDesktopSyncGroup, loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveDesktopHostName } from './companionLanPayloads.js';
import {
  registerPairedCompanionAuthorizationWithSecret,
  savePairedSyncGroupPeer
} from './companionPairingStore.js';
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import { requestJson } from './desktopSyncGroupHttp.js';
import { refreshDesktopSyncGroupPendingJoinFromDiscovery } from './desktopSyncGroupJoinEndpoint.js';
import { loadDesktopSyncGroupJoinState, saveDesktopSyncGroupPendingJoin } from './desktopSyncGroupJoinState.js';
import { createDesktopSyncGroupPairingKey, decryptDesktopSyncGroupPairingSecret } from './desktopSyncGroupPairingCrypto.js';
export { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';
import { saveDesktopWorkgroupKey } from './workgroupKeyStore.js';

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
    && existingGroup.group_id === candidate.group_id;
  if (existingGroup && !isActiveSameGroup) throw new Error('sync_group_identity_mismatch');
  const key = await createDesktopSyncGroupPairingKey();
  const payload = await requestJson(`${endpointUrl}/companion/pair-requests`, {
    body: JSON.stringify({
      host_name: resolveDesktopHostName(), host_platform: process.platform,
      group_id: candidate.group_id, group_tag: candidate.group_tag, library_facts: facts,
      pairing_public_key: key.publicKey,
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
  const secret = await decryptDesktopSyncGroupPairingSecret(
    pending.key.privateKey, payload.encrypted_credential_secret
  );
  if (!payload.provider_encrypted_credential_secret || !payload.provider_authorization_id ||
      !payload.provider_host_name || !payload.provider_host_platform) {
    throw new Error('sync_group_provider_pairing_invalid');
  }
  const providerSecret = await decryptDesktopSyncGroupPairingSecret(
    pending.key.privateKey, payload.provider_encrypted_credential_secret
  );
  if (providerSecret !== secret) throw new Error('sync_group_workgroup_key_mismatch');
  const negotiatedProtocolVersion = payload.compatibility.negotiated_version;
  if (negotiatedProtocolVersion !== CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version) {
    throw new Error('sync_protocol_incompatible');
  }
  const localHostName = payload.host_name?.trim();
  if (!localHostName) throw new Error('sync_group_membership_invalid');
  const existingGroup = loadDesktopSyncGroup();
  if (!existingGroup) joinDesktopSyncGroup({
    hostName: localHostName, group: payload.sync_group, workgroupKey: secret
  });
  else saveDesktopWorkgroupKey({ groupId: pending.candidate.group_id, groupKey: secret });
  registerPairedCompanionAuthorizationWithSecret({
    authorizationId: payload.provider_authorization_id, credentialSecret: providerSecret,
    hostName: payload.provider_host_name, hostPlatform: payload.provider_host_platform,
    negotiatedProtocolVersion,
    remoteProtocol: payload.desktop_protocol
  });
  const peer = savePairedSyncGroupPeer({
    endpoint_url: pending.candidate.endpoint_url, group_id: pending.candidate.group_id,
    local_authorization_id: payload.authorization_id,
    local_host_name: localHostName,
    peer_authorization_id: payload.provider_authorization_id,
    peer_host_name: payload.provider_host_name,
    peer_host_platform: payload.provider_host_platform,
    timeline_id: pending.candidate.timeline_id
  });
  saveDesktopSyncGroupPendingJoin(null);
  await runDesktopSyncCoordinator('initial', peer).catch((error) => {
    console.info('[sync-group] initial sync waiting for provider', {
      error: error instanceof Error ? error.message : String(error),
      peerAuthorizationId: peer.peer_authorization_id
    });
  });
  return loadDesktopSyncGroup();
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
