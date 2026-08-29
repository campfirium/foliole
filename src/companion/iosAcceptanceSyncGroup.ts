import { deriveWorkgroupTag } from '../../lib/core/sync/workgroupAead';
import {
  IOS_HOSTED_DISCOVERY_TXT_KEYS,
  IOS_HOSTED_PROVIDER_DEVICE_ID,
  IOS_HOSTED_SYNC_GROUP_ID
} from '../../lib/platform/iosHostedSyncGroupContract';
import {
  parseSyncProtocolTxt,
  syncProtocolVersionHintMatchesDescriptor
} from '../../lib/platform/syncProtocolContract';
import {
  loadCompanionSyncGroup,
  loadCompanionSyncGroupWorkgroupKey
} from '../shared/platform/companion/sync/syncGroupStore';
import {
  completeCompanionSyncGroupJoin,
  requestCompanionSyncGroupJoin
} from '../shared/platform/companionSyncGroupJoinClient';
import {
  loadCompanionDiscoveryCandidates,
  type DiscoveryCandidate
} from '../shared/platform/companionWorkspaceDiscovery';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

export async function discoverIosHostedProvider() {
  const payload = await FolioleCompanionSync.loadDiscoveryCandidates();
  const candidates = (payload.candidates ?? []).filter((candidate) => candidate.source === 'nsd')
    .map((candidate) => ({
      endpointUrl: candidate.endpoint_url,
      protocolTxt: candidate.protocol_txt ?? null,
      source: candidate.source
    } satisfies DiscoveryCandidate));
  const discovered = await loadCompanionDiscoveryCandidates(candidates);
  const exact = discovered.filter((result) => matchesHostedIdentity(
    candidates.find((candidate) => candidate.endpointUrl === result.endpointUrl)?.protocolTxt ?? null,
    result.discovery
  ));
  if (exact.length !== 1) throw new Error(`ios_hosted_sync_group_discovery_count_${exact.length}`);
  return exact[0]!;
}

export async function joinIosAcceptanceSyncGroup(databasePath: string) {
  const discovered = await discoverIosHostedProvider();
  const pending = await requestCompanionSyncGroupJoin({
    databasePath, endpointUrl: discovered.endpointUrl, groupId: discovered.discovery.group_id
  });
  const group = await completeCompanionSyncGroupJoin({
    databasePath, endpointUrl: discovered.endpointUrl, requestId: pending.request_id
  });
  const workgroupKey = await loadCompanionSyncGroupWorkgroupKey();
  const groupTag = workgroupKey ? await deriveWorkgroupTag(workgroupKey) : null;
  if (group.group_id !== discovered.discovery.group_id || groupTag !== discovered.discovery.group_tag) {
    throw new Error('sync_group_discovery_identity_mismatch');
  }
  return {
    endpointUrl: discovered.endpointUrl,
    group: { ...group, group_tag: groupTag },
    peer: syncPeerFromDiscovery(discovered.discovery)
  };
}

export async function ensureIosAcceptanceSyncGroup(databasePath: string | null) {
  const discovered = await discoverIosHostedProvider();
  const existing = await loadCompanionSyncGroup();
  if (existing) {
    const workgroupKey = await loadCompanionSyncGroupWorkgroupKey();
    const groupTag = workgroupKey ? await deriveWorkgroupTag(workgroupKey) : null;
    if (existing.group_id !== discovered.discovery.group_id || groupTag !== discovered.discovery.group_tag) {
      throw new Error('sync_group_identity_mismatch');
    }
    return {
      endpointUrl: discovered.endpointUrl,
      group: { ...existing, group_tag: groupTag },
      joined: false,
      peer: syncPeerFromDiscovery(discovered.discovery)
    };
  }
  if (!databasePath) throw new Error('iOS acceptance database is unavailable.');
  const joined = await joinIosAcceptanceSyncGroup(databasePath);
  return { ...joined, joined: true };
}

function syncPeerFromDiscovery(discovery: {
  provider_device_id: string;
  provider_device_name: string;
}) {
  const sourcePeerId = discovery.provider_device_id.trim();
  const sourceHostName = discovery.provider_device_name.trim();
  if (!sourcePeerId || !sourceHostName) throw new Error('ios_hosted_sync_group_peer_invalid');
  return {
    sourceHostName,
    sourcePeerId
  };
}

function matchesHostedIdentity(protocolTxt: Record<string, string> | null, discovery: {
  group_id: string;
  group_tag: string;
  protocol: unknown;
  provider_device_id: string;
  runtime_instance_id: string;
}) {
  if (!protocolTxt || discovery.group_id !== IOS_HOSTED_SYNC_GROUP_ID ||
      discovery.provider_device_id !== IOS_HOSTED_PROVIDER_DEVICE_ID) return false;
  return protocolTxt[IOS_HOSTED_DISCOVERY_TXT_KEYS.deviceId] === discovery.provider_device_id &&
    protocolTxt[IOS_HOSTED_DISCOVERY_TXT_KEYS.groupId] === discovery.group_id &&
    protocolTxt[IOS_HOSTED_DISCOVERY_TXT_KEYS.groupTag] === discovery.group_tag &&
    protocolTxt[IOS_HOSTED_DISCOVERY_TXT_KEYS.runtimeInstanceId] === discovery.runtime_instance_id &&
    /^[0-9a-f]{32}$/u.test(discovery.group_tag) &&
    syncProtocolVersionHintMatchesDescriptor(parseSyncProtocolTxt(protocolTxt), discovery.protocol);
}
