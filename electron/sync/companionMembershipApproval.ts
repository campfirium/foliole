import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { isAssignedSyncGroupDeviceName } from '../../lib/platform/syncGroupDeviceProfile.js';

import type { PendingCompanionPairRequest } from './companionPairingRequests.js';

export type CompanionMembershipApprovalAction =
  | 'join_as_new_member'
  | 'recover_existing_member';

function matchingActiveMember(request: PendingCompanionPairRequest, group: SyncGroupPayload | null) {
  const active = group?.members.filter(({ state }) => state === 'active') ?? [];
  const exact = active.find(({ device_id: id }) => id === request.device_id);
  if (exact) return exact;
  const assigned = active.filter(({ device_name: name }) => (
    isAssignedSyncGroupDeviceName(name, request.device_name)
  ));
  return assigned.length === 1 ? assigned[0] : null;
}

export function resolveCompanionMembershipApproval(
  request: PendingCompanionPairRequest,
  group: SyncGroupPayload | null
): CompanionMembershipApprovalAction {
  return matchingActiveMember(request, group) ? 'recover_existing_member' : 'join_as_new_member';
}

export function resolveCompanionMembershipDeviceId(
  request: PendingCompanionPairRequest,
  group: SyncGroupPayload | null
) {
  return matchingActiveMember(request, group)?.device_id ?? request.device_id;
}
