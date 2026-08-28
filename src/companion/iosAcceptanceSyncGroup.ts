import { deriveWorkgroupTag } from '../../lib/core/sync/workgroupAead';
import { resolveRemoteSyncGroupDevices } from '../../lib/platform/syncGroupContract';
import { loadCompanionDiscoveryEndpoint } from '../shared/platform/companion/network/companionSyncGroupHttpRequest';
import {
  loadCompanionSyncGroup,
  loadCompanionSyncGroupWorkgroupKey
} from '../shared/platform/companion/sync/syncGroupStore';
import {
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
} from '../shared/platform/companionSyncGroupJoinClient';

export async function joinIosAcceptanceSyncGroup(endpointUrl: string, databasePath: string) {
  const discovery = await loadCompanionDiscoveryEndpoint(endpointUrl);
  const pending = await requestCompanionSyncGroupJoin({
    databasePath, endpointUrl, groupId: discovery.group_id
  });
  const group = await completeCompanionSyncGroupJoin({ databasePath, endpointUrl, requestId: pending.request_id });
  const workgroupKey = await loadCompanionSyncGroupWorkgroupKey();
  const groupTag = workgroupKey ? await deriveWorkgroupTag(workgroupKey) : null;
  if (group.group_id !== discovery.group_id || groupTag !== discovery.group_tag) {
    throw new Error('sync_group_discovery_identity_mismatch');
  }
  return { ...group, group_tag: groupTag };
}

export async function ensureIosAcceptanceSyncGroup(endpointUrl: string, databasePath: string | null) {
  const existing = await loadCompanionSyncGroup();
  if (existing) return { group: existing, joined: false };
  if (!databasePath) throw new Error('iOS acceptance database is unavailable.');
  return { group: await joinIosAcceptanceSyncGroup(endpointUrl, databasePath), joined: true };
}

export async function loadIosAcceptanceSyncPeer() {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const device = resolveRemoteSyncGroupDevices(group)[0];
  if (!device) throw new Error('sync_pack_source_device_unavailable');
  return { sourceHostName: device.device_name, sourcePeerId: device.device_identity_key };
}
