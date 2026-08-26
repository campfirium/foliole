import { resolveRemoteSyncGroupDevices } from '../../lib/platform/syncGroupContract';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import {
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
} from '../shared/platform/companionSyncGroupJoinClient';
import { discoverCompanionDesktop } from '../shared/platform/companionWorkspaceDiscovery';

export async function joinIosAcceptanceSyncGroup(endpointUrl: string, databasePath: string) {
  const discovery = await discoverCompanionDesktop(endpointUrl, { allowWhileNotParticipating: true });
  const pending = await requestCompanionSyncGroupJoin({
    databasePath, endpointUrl, groupId: discovery.discovery.group_id
  });
  return completeCompanionSyncGroupJoin({ databasePath, endpointUrl, requestId: pending.request_id });
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
