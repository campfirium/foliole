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
import { waitForCompanionDesktopAdvertisements } from '../shared/platform/companion/companionDesktopDiscoveryWait';
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
  type CompanionDiscoveryFailure,
  type DiscoveryCandidate
} from '../shared/platform/companionWorkspaceDiscovery';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

const VERIFY_PASSES = 3;
const VERIFY_RETRY_DELAY_MS = 2000;

// Advertisement verification follows periodic rediscovery: a pass whose probes only timed out
// or could not connect is repeated, while identity, HTTP, or count mismatches fail at once.
async function verifyHostedCandidates(candidates: DiscoveryCandidate[]) {
  for (let pass = 1; ; pass += 1) {
    const failures: CompanionDiscoveryFailure[] = [];
    const discovered = await loadCompanionDiscoveryCandidates(candidates, failure => failures.push(failure));
    const exact = discovered.filter((result) => matchesHostedIdentity(
      candidates.find((candidate) => candidate.endpointUrl === result.endpointUrl)?.protocolTxt ?? null,
      result.discovery
    ));
    const onlyRequestFailures = failures.length > 0 && failures.every((failure) => failure.kind === 'request');
    if (exact.length > 0 || !onlyRequestFailures || pass === VERIFY_PASSES) return { discovered, exact, failures };
    await new Promise((resolve) => setTimeout(resolve, VERIFY_RETRY_DELAY_MS));
  }
}

export async function discoverIosHostedProvider() {
  const payload = await FolioleCompanionSync.loadDiscoveryCandidates();
  const nativeCandidates = payload.candidates?.length
    ? payload.candidates
    : await waitForCompanionDesktopAdvertisements(FolioleCompanionSync, undefined, IOS_HOSTED_SYNC_GROUP_ID);
  const candidates = nativeCandidates.filter((candidate) => candidate.source === 'nsd')
    .map((candidate) => ({
      endpointUrl: candidate.endpoint_url,
      protocolTxt: candidate.protocol_txt ?? null,
      source: candidate.source
    } satisfies DiscoveryCandidate));
  const { discovered, exact, failures } = await verifyHostedCandidates(candidates);
  if (exact.length !== 1) {
    const evidence = {
      nativeCount: nativeCandidates.length,
      failures,
      advertisements: candidates.map(candidate => ({
        endpoint: candidate.endpointUrl, groupId: candidate.protocolTxt?.group_id,
        runtimeId: candidate.protocolTxt?.runtime_instance_id
      })),
      verified: discovered.map(result => ({
        endpoint: result.endpointUrl, groupId: result.discovery.group_id,
        runtimeId: result.discovery.runtime_instance_id
      }))
    };
    throw new Error(`ios_hosted_sync_group_discovery_count_${exact.length}: ${JSON.stringify(evidence)}`);
  }
  return exact[0]!;
}

export async function joinIosAcceptanceSyncGroup(databasePath: string) {
  const discovered = await discoverIosHostedProvider();
  const pending = await requestCompanionSyncGroupJoin({ mode: 'use-group',
    databasePath, endpointUrl: discovered.endpointUrl, groupId: discovered.discovery.group_id
  });
  const group = await completeCompanionSyncGroupJoin({
    databasePath, endpointUrl: discovered.endpointUrl,
    providerDeviceId: discovered.discovery.provider_device_id,
    providerDeviceName: discovered.discovery.provider_device_name,
    providerPlatform: discovered.discovery.provider_platform,
    requestId: pending.request_id
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
