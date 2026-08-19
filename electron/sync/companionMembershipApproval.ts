import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { isAssignedSyncGroupHostName } from '../../lib/platform/syncGroupDeviceProfile.js';

import type { PendingCompanionPairRequest } from './companionPairingRequests.js';
import { loadPairedCompanionDevice } from './companionPairingStore.js';

export type CompanionMembershipApprovalAction =
  | 'join_as_new_member'
  | 'recover_existing_member';

function matchingActiveMember(request: PendingCompanionPairRequest, group: SyncGroupPayload | null) {
  const active = group?.members.filter(({ state }) => state === 'active') ?? [];
  const exact = active.find(({ host_name: name }) => name === request.host_name);
  if (exact) return exact;
  const previousHostName = loadPairedCompanionDevice(request.device_id)?.device_name;
  const previous = previousHostName
    ? active.find(({ host_name: name }) => name === previousHostName)
    : null;
  if (previous) return previous;
  const assigned = active.filter(({ host_name: name }) => (
    isAssignedSyncGroupHostName(name, request.host_name)
  ));
  return assigned.length === 1 ? assigned[0] : null;
}

export function resolveCompanionMembershipApproval(
  request: PendingCompanionPairRequest,
  group: SyncGroupPayload | null
): CompanionMembershipApprovalAction {
  return matchingActiveMember(request, group) ? 'recover_existing_member' : 'join_as_new_member';
}

export function resolveCompanionMembershipHostName(
  request: PendingCompanionPairRequest
) {
  return request.host_name;
}

export function resolveCompanionMembershipAuthorizationId(
  request: PendingCompanionPairRequest,
  group: SyncGroupPayload | null
) {
  return matchingActiveMember(request, group)?.authorization_id ?? null;
}
