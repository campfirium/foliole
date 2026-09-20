import { observeResourceProviders, transferResourceProviders,
  type ResourceProvider, type ResourceTransfer } from '../../../../../lib/core/sync/resourceProviderPass';
import { RESOURCE_AVAILABILITY_PATH, type ResourceNeed } from '../../../../../lib/platform/resourceAvailabilityContract';
import { postDesktopJson } from '../../companionDesktopSyncHttp';
import { loadCompanionDiscoveryCandidates, type DiscoveryCandidate } from '../../companionWorkspaceDiscovery';
import { FolioleCompanionSync, normalizeEndpointUrl } from '../../companionWorkspaceRuntimeRepository';
import { isCompanionSyncGroupDeviceBlocked } from '../sync/syncGroupMemberStateStore';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

import { exchangeCompanionSyncGroupMemberState } from './companionSyncGroupMemberState';

type CompanionResourceProvider = ResourceProvider & { groupId: string };

export async function loadCompanionResourceProviders(preferredEndpoint: string) {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_available');
  const eligibleDeviceIds = await eligibleMemberIds(group.group_id);
  const native = await FolioleCompanionSync.loadDiscoveryCandidates();
  const candidates: DiscoveryCandidate[] = [...new Set([
    normalizeEndpointUrl(preferredEndpoint), ...native.candidates.map((candidate) => normalizeEndpointUrl(candidate.endpoint_url))
  ])].filter(Boolean).map((endpointUrl) => ({ endpointUrl, protocolTxt: null, source: 'direct' }));
  const discovered = await loadCompanionDiscoveryCandidates(candidates);
  const providers = discovered.filter((candidate) => candidate.compatibility.status === 'compatible' &&
    candidate.discovery.group_id === group.group_id && eligibleDeviceIds.includes(candidate.discovery.provider_device_id)
  ).map((candidate) => ({ deviceId: candidate.discovery.provider_device_id,
    endpointUrl: candidate.endpointUrl, groupId: group.group_id }));
  return { providers, eligibleDeviceIds, groupId: group.group_id };
}

async function eligibleMemberIds(groupId: string) {
  const group = await loadCompanionSyncGroup();
  if (!group || group.group_id !== groupId) return [];
  const members = group.devices.filter((device) => device.state === 'active' &&
    device.device_identity_key !== group.local_device_identity_key);
  const eligibility = await Promise.all(members.map(async (device) => ({
    id: device.device_identity_key,
    blocked: await isCompanionSyncGroupDeviceBlocked(groupId, device.device_identity_key)
  })));
  return eligibility.filter((member) => !member.blocked).map((member) => member.id);
}

async function queryAvailability(provider: CompanionResourceProvider, needs: readonly ResourceNeed[]) {
  const state = await exchangeCompanionSyncGroupMemberState(provider);
  if (state.localExited || state.peerRemoved) throw new Error('sync_group_device_not_active');
  return postDesktopJson(provider.endpointUrl, RESOURCE_AVAILABILITY_PATH, { resources: needs });
}

export async function runCompanionResourceProviderBatch(args: {
  endpointUrl: string; needs: readonly ResourceNeed[];
  transfer: (endpointUrl: string, needs: readonly ResourceNeed[]) => Promise<ResourceTransfer>;
}) {
  const peers = await loadCompanionResourceProviders(args.endpointUrl);
  const observed = await observeResourceProviders({ providers: peers.providers, needs: args.needs, query: queryAvailability });
  const result = await transferResourceProviders({ ...observed, needs: args.needs, refresh: queryAvailability,
    eligibleDeviceIds: await eligibleMemberIds(peers.groupId),
    transfer: async (provider, needs) => {
      if (!(await eligibleMemberIds(peers.groupId)).includes(provider.deviceId)) throw new Error('sync_group_device_not_active');
      return args.transfer(provider.endpointUrl, needs);
    }
  });
  const issues = [...observed.issues, ...result.issues];
  if (issues.length) console.warn('[sync] resource provider failures', { issues });
  return { ...result, issues };
}
