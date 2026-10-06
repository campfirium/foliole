import {
  parseSyncGroupJoinGroupInfo,
  SYNC_GROUP_JOIN_CONTRACT_VERSION,
  type SyncGroupJoinAcceptance
} from '../../../lib/platform/syncGroupJoinContract';
import { parseSyncGroupJoinMode, type SyncGroupJoinMode } from '../../../lib/platform/syncGroupJoinMode';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract';

import { requestCompanionSyncGroupEndpoint } from './companion/network/companionSyncGroupHttpRequest';
import { completeCompanionSyncGroupAdoption } from './companion/sync/completeCompanionSyncGroupAdoption';
import { joinCompanionSyncGroup, loadCompanionSyncGroup } from './companion/sync/syncGroupStore';
import {
  createCompanionSyncGroupJoinPublicKey,
  decryptCompanionSyncGroupJoinInfo,
  dropCompanionSyncGroupJoinPrivateKey
} from './companionSyncGroupJoinEncryption';
import { createCompanionUuid } from './companionUuid';
import { FolioleCompanionSync, normalizeEndpointUrl } from './companionWorkspaceRuntimeRepository';

const keyIds = new Map<string, { keyId: string; mode: SyncGroupJoinMode; groupId: string }>();

export async function requestCompanionSyncGroupJoin(args: {
  databasePath: string;
  endpointUrl: string;
  groupId: string;
  mode: SyncGroupJoinMode;
}) {
  const mode = parseSyncGroupJoinMode(args.mode);
  if (await loadCompanionSyncGroup()) throw new Error('sync_group_identity_mismatch');
  const device = await FolioleCompanionSync.loadSyncGroupDeviceIdentity({ database_path: args.databasePath });
  const keyId = createCompanionUuid();
  const publicKey = await createCompanionSyncGroupJoinPublicKey(keyId);
  const endpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const response = await requestCompanionSyncGroupEndpoint(`${endpointUrl}/sync-group/join-requests`, {
    body: JSON.stringify({
      contract_version: SYNC_GROUP_JOIN_CONTRACT_VERSION,
      device,
      ephemeral_public_key: publicKey,
      group_id: args.groupId,
    }),
    headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  if (!response.ok) {
    dropCompanionSyncGroupJoinPrivateKey(keyId);
    const error = await response.json().catch(() => null) as { error?: unknown } | null;
    if (typeof error?.error === 'string') throw new Error(error.error);
    throw new Error(`sync_group_join_request_http_${response.status}`);
  }
  const payload = await response.json() as { expires_at: string; request_id: string };
  keyIds.set(payload.request_id, { keyId, mode, groupId: args.groupId });
  return { endpoint_url: endpointUrl, expires_at: payload.expires_at,
    group_id: args.groupId, request_id: payload.request_id, status: 'pending' as const };
}

export async function completeCompanionSyncGroupJoin(args: {
  databasePath: string;
  endpointUrl: string;
  providerDeviceId: string;
  providerDeviceName: string;
  providerPlatform: string;
  requestId: string;
}) {
  const existing = await loadCompanionSyncGroup();
  if (existing) {
    if (!existing.devices.some((device) => device.device_identity_key === args.providerDeviceId)) {
      throw new Error('sync_group_identity_mismatch');
    }
    await completeCompanionSyncGroupAdoption();
    cancelCompanionSyncGroupJoin(args.requestId);
    return existing;
  }
  const endpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const response = await requestCompanionSyncGroupEndpoint(`${endpointUrl}/sync-group/join-acceptance`, {
    body: JSON.stringify({ request_id: args.requestId }),
    headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  if (!response.ok) throw new Error(`sync_group_join_acceptance_http_${response.status}`);
  const acceptance = await response.json() as SyncGroupJoinAcceptance;
  const pending = keyIds.get(args.requestId);
  const keyId = pending?.keyId;
  if (!keyId || acceptance.request_id !== args.requestId) throw new Error('sync_group_join_acceptance_invalid');
  const plaintext = await decryptCompanionSyncGroupJoinInfo(keyId, acceptance.encrypted_group_info);
  const info = parseSyncGroupJoinGroupInfo(JSON.parse(plaintext));
  if (info.group_id !== pending!.groupId) throw new Error('sync_group_identity_mismatch');
  const facts = await FolioleCompanionSync.loadSyncGroupDeviceIdentity({ database_path: args.databasePath });
  const provider = providerFromDiscovery(args, info.group_id);
  const group = await joinCompanionSyncGroup({
    mode: pending!.mode,
    endpointUrl,
    device: createSyncGroupDeviceIdentity({ device_anchor: facts.device_anchor, group_id: info.group_id,
      library_path: facts.canonical_library_path, path_flavor: facts.path_flavor }),
    deviceName: facts.device_name,
    displayName: info.display_name,
    platform: facts.platform,
    provider,
    workgroupKey: info.workgroup_key
  });
  if (pending!.mode === 'use-group') await completeCompanionSyncGroupAdoption();
  dropCompanionSyncGroupJoinPrivateKey(keyId);
  keyIds.delete(args.requestId);
  return group;
}

export function providerFromDiscovery(args: {
  providerDeviceId: string;
  providerDeviceName: string;
  providerPlatform: string;
}, groupId: string) {
  let parts: unknown;
  try { parts = JSON.parse(args.providerDeviceId); } catch { throw new Error('sync_group_provider_identity_invalid'); }
  if (!Array.isArray(parts) || parts.length !== 4 || parts[0] !== 1 || parts[1] !== groupId
      || typeof parts[2] !== 'string' || typeof parts[3] !== 'string') {
    throw new Error('sync_group_provider_identity_invalid');
  }
  const device = createSyncGroupDeviceIdentity({
    device_anchor: parts[2], group_id: groupId, library_path: parts[3],
    path_flavor: isWindowsProvider(args.providerPlatform) ? 'windows' : 'posix'
  });
  if (device.identity_key !== args.providerDeviceId) throw new Error('sync_group_provider_identity_invalid');
  const deviceName = args.providerDeviceName.trim();
  const platform = args.providerPlatform.trim();
  if (!deviceName || !platform) throw new Error('sync_group_provider_identity_invalid');
  return { device, deviceName, platform };
}

function isWindowsProvider(platform: string) {
  const normalized = platform.trim().toLowerCase();
  return normalized === 'win32' || normalized.startsWith('windows');
}

export function cancelCompanionSyncGroupJoin(requestId: string) {
  const keyId = keyIds.get(requestId)?.keyId;
  if (keyId) dropCompanionSyncGroupJoinPrivateKey(keyId);
  keyIds.delete(requestId);
}
