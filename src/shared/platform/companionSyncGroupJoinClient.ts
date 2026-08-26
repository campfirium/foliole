import {
  parseSyncGroupJoinGroupInfo,
  SYNC_GROUP_JOIN_CONTRACT_VERSION,
  type SyncGroupJoinAcceptance
} from '../../../lib/platform/syncGroupJoinContract';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract';

import { requestCompanionSyncGroupEndpoint } from './companion/network/companionSyncGroupHttpRequest';
import { joinCompanionSyncGroup, loadCompanionSyncGroup } from './companion/sync/syncGroupStore';
import {
  createCompanionSyncGroupJoinPublicKey,
  decryptCompanionSyncGroupJoinInfo,
  dropCompanionSyncGroupJoinPrivateKey
} from './companionSyncGroupJoinEncryption';
import { createCompanionUuid } from './companionUuid';
import { FolioleCompanionSync, normalizeEndpointUrl } from './companionWorkspaceRuntimeRepository';

const keyIds = new Map<string, string>();

export async function requestCompanionSyncGroupJoin(args: {
  databasePath: string;
  endpointUrl: string;
  groupId: string;
}) {
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
      group_id: args.groupId
    }),
    headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  if (!response.ok) {
    dropCompanionSyncGroupJoinPrivateKey(keyId);
    throw new Error(`sync_group_join_request_http_${response.status}`);
  }
  const payload = await response.json() as { expires_at: string; request_id: string };
  keyIds.set(payload.request_id, keyId);
  return { endpoint_url: endpointUrl, expires_at: payload.expires_at,
    group_id: args.groupId, request_id: payload.request_id, status: 'pending' as const };
}

export async function completeCompanionSyncGroupJoin(args: {
  databasePath: string;
  endpointUrl: string;
  requestId: string;
}) {
  const endpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const response = await requestCompanionSyncGroupEndpoint(`${endpointUrl}/sync-group/join-acceptance`, {
    body: JSON.stringify({ request_id: args.requestId }),
    headers: { 'Content-Type': 'application/json' }, method: 'POST'
  });
  if (!response.ok) throw new Error(`sync_group_join_acceptance_http_${response.status}`);
  const acceptance = await response.json() as SyncGroupJoinAcceptance;
  const keyId = keyIds.get(args.requestId);
  if (!keyId || acceptance.request_id !== args.requestId) throw new Error('sync_group_join_acceptance_invalid');
  const plaintext = await decryptCompanionSyncGroupJoinInfo(keyId, acceptance.encrypted_group_info);
  dropCompanionSyncGroupJoinPrivateKey(keyId);
  keyIds.delete(args.requestId);
  const info = parseSyncGroupJoinGroupInfo(JSON.parse(plaintext));
  const facts = await FolioleCompanionSync.loadSyncGroupDeviceIdentity({ database_path: args.databasePath });
  return joinCompanionSyncGroup({
    device: createSyncGroupDeviceIdentity({ device_anchor: facts.device_anchor, group_id: info.group_id,
      library_path: facts.canonical_library_path, path_flavor: facts.path_flavor }),
    deviceName: facts.device_name,
    displayName: info.display_name,
    platform: facts.platform,
    workgroupKey: info.workgroup_key
  });
}

export function cancelCompanionSyncGroupJoin(requestId: string) {
  const keyId = keyIds.get(requestId);
  if (keyId) dropCompanionSyncGroupJoinPrivateKey(keyId);
  keyIds.delete(requestId);
}
