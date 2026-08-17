import { hasSourceOwnershipSyncFeature, isKnownMobileSyncDeviceKind } from '../../platform/syncAdvertisedFeatures.js';

export interface SourceOwnershipMemberFact {
  advertised_features_json: string | null;
  authorization_id: string;
  device_id: string;
  device_kind: string;
  joined_at: string;
  state: string;
}

export interface SourceOwnershipReadiness {
  blockedMemberIds: string[];
  ready: boolean;
  reason: 'member_upgrade_required' | 'ready' | 'sync_group_provisioning';
}

function parseFeatures(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

export function evaluateSourceOwnershipReadiness(input: {
  localMemberState: string | null;
  members: SourceOwnershipMemberFact[];
}): SourceOwnershipReadiness {
  if (input.localMemberState === 'provisioning') {
    return { blockedMemberIds: [], ready: false, reason: 'sync_group_provisioning' };
  }
  const blockedMemberIds = input.members
    .filter((member) => member.state === 'active')
    .filter((member) => !isKnownMobileSyncDeviceKind(member.device_kind))
    .filter((member) => !hasSourceOwnershipSyncFeature(parseFeatures(member.advertised_features_json)))
    .map((member) => member.device_id)
    .sort();
  return blockedMemberIds.length > 0
    ? { blockedMemberIds, ready: false, reason: 'member_upgrade_required' }
    : { blockedMemberIds: [], ready: true, reason: 'ready' };
}
