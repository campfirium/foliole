import { discoverCompanionDesktop } from '../../companionWorkspaceDiscovery';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

async function loadPeer(endpointUrl: string) {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const result = await discoverCompanionDesktop(endpointUrl);
  if (result.discovery.group_id !== group.group_id) throw new Error('sync_group_identity_mismatch');
  const peerId = result.discovery.provider_device_id.trim();
  const deviceName = result.discovery.provider_device_name.trim();
  if (!peerId || !deviceName) throw new Error('sync_group_source_device_unavailable');
  return { deviceName, peerId };
}

export async function resolveCompanionSyncPeerId(endpointUrl: string) {
  return (await loadPeer(endpointUrl)).peerId;
}

export async function resolveCompanionSyncPeerHostName(endpointUrl: string) {
  return (await loadPeer(endpointUrl)).deviceName;
}
