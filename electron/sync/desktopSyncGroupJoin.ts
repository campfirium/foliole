import {
  parseSyncGroupJoinGroupInfo,
  SYNC_GROUP_JOIN_CONTRACT_VERSION,
  type SyncGroupJoinAcceptance
} from '../../lib/platform/syncGroupJoinContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { joinDesktopSyncGroup, loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadDesktopDeviceIdentity } from '../deviceAnchorStore.js';

import { resolveDesktopHostName } from './companionLanPayloads.js';
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import { requestJson } from './desktopSyncGroupHttp.js';
import {
  createDesktopSyncGroupJoinKey,
  decryptDesktopSyncGroupJoinInfo
} from './desktopSyncGroupJoinCrypto.js';
import { refreshDesktopSyncGroupPendingJoinFromDiscovery } from './desktopSyncGroupJoinEndpoint.js';
import {
  loadDesktopSyncGroupJoinState,
  saveDesktopSyncGroupPendingJoin
} from './desktopSyncGroupJoinState.js';
import { saveDesktopSyncGroupRoute } from './desktopSyncGroupRoutes.js';

let joinCompletionInFlight: Promise<ReturnType<typeof loadDesktopSyncGroup>> | null = null;

export async function requestDesktopSyncGroupJoin(endpointUrl: string) {
  const state = loadDesktopSyncGroupJoinState();
  const candidate = state.candidates.find((item) => item.endpoint_url === endpointUrl);
  if (!candidate) throw new Error('sync_group_candidate_not_found');
  if (loadDesktopSyncGroup()) throw new Error('sync_group_identity_mismatch');
  const connection = openDatabaseConnection();
  const [{ identity }, key] = await Promise.all([
    loadDesktopDeviceIdentity({ groupId: candidate.group_id, libraryPath: connection.dbPath }),
    createDesktopSyncGroupJoinKey()
  ]);
  const payload = await requestJson(`${endpointUrl}/sync-group/join-requests`, {
    body: JSON.stringify({
      contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
      device: {
        canonical_library_path: identity.canonical_library_path,
        device_anchor: identity.device_anchor,
        device_name: resolveDesktopHostName(),
        path_flavor: process.platform === 'win32' ? 'windows' : 'posix',
        platform: process.platform
      },
      ephemeral_public_key: key.publicKey,
      group_id: candidate.group_id
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  saveDesktopSyncGroupPendingJoin({
    candidate,
    key,
    request: {
      endpoint_url: endpointUrl,
      expires_at: requiredText(payload.expires_at, 'sync_group_join_response_invalid'),
      group_id: candidate.group_id,
      request_id: requiredText(payload.request_id, 'sync_group_join_response_invalid'),
      status: 'pending'
    }
  });
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
  const pending = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroupJoinState().pending);
  if (!pending) throw new Error('sync_group_join_not_pending');
  let payload: Record<string, unknown>;
  try {
    payload = await requestJson(`${pending.candidate.endpoint_url}/sync-group/join-acceptance`, {
      body: JSON.stringify({ request_id: pending.request.request_id }),
      headers: { 'Content-Type': 'application/json' }, method: 'POST'
    });
  } catch (error) {
    if (error instanceof TypeError && await refreshDesktopSyncGroupPendingJoinFromDiscovery()) {
      throw new Error('sync_group_join_provider_changed');
    }
    throw error;
  }
  const acceptance = parseAcceptance(payload, pending.request.request_id);
  const plaintext = await decryptDesktopSyncGroupJoinInfo(
    pending.key.privateKey, acceptance.encrypted_group_info
  );
  const groupInfo = parseSyncGroupJoinGroupInfo(JSON.parse(plaintext));
  if (groupInfo.group_id !== pending.candidate.group_id) throw new Error('sync_group_identity_mismatch');
  const route = await runWithDatabaseConnectionOwner(async () => {
    const connection = openDatabaseConnection();
    const { identity } = await loadDesktopDeviceIdentity({
      groupId: groupInfo.group_id, libraryPath: connection.dbPath
    });
    const group = joinDesktopSyncGroup({
      device: identity, deviceName: resolveDesktopHostName(),
      displayName: groupInfo.display_name, platform: process.platform,
      workgroupKey: groupInfo.workgroup_key
    });
    saveDesktopSyncGroupPendingJoin(null);
    return saveDesktopSyncGroupRoute({
      endpoint_url: pending.candidate.endpoint_url,
      group_id: groupInfo.group_id,
      local_device_id: group.local_device_identity_key,
      peer_device_id: pending.candidate.provider_device_id,
      peer_device_name: pending.candidate.provider_device_name,
      peer_platform: pending.candidate.provider_platform
    });
  });
  await runDesktopSyncCoordinator('initial', route);
  return runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup());
}

function parseAcceptance(value: Record<string, unknown>, requestId: string): SyncGroupJoinAcceptance {
  if (value.request_id !== requestId || typeof value.expires_at !== 'string' ||
      !value.encrypted_group_info || typeof value.encrypted_group_info !== 'object') {
    throw new Error('sync_group_join_acceptance_invalid');
  }
  return value as unknown as SyncGroupJoinAcceptance;
}

function requiredText(value: unknown, error: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
  return value;
}
